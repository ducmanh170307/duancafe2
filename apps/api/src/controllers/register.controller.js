const {query,transaction}=require('../config/db');
const {openShift,lastShift,cashSummary}=require('../models/register.model');
const {calcCashExpected}=require('../utils/rules');
const {wrap,ok,ensure,number,fail}=require('../utils/http');
const {branchAccess}=require('../middleware/auth');
const {audit}=require('../services/audit.service');
exports.list=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||req.user.branch_id||1,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const rows=await query(`SELECT cs.*,r.name AS register_name,u.name AS cashier_name FROM cash_shifts cs JOIN registers r ON r.id=cs.register_id JOIN users u ON u.id=cs.cashier_id
 WHERE cs.branch_id=? ORDER BY cs.id DESC LIMIT 30`,[branchId]);
 const active=rows.filter(s=>['OPEN','PAUSED','PENDING_APPROVAL'].includes(s.status));
 ok(res,{shifts:rows,active});
});
exports.open=wrap(async(req,res)=>{
 const registerId=number(req.body.register_id,'Quầy',{min:1,integer:true});const opening=number(req.body.opening_cash,'Tiền đầu ca');
 const id=await transaction(async conn=>{
  const r=(await query('SELECT * FROM registers WHERE id=? FOR UPDATE',[registerId],conn))[0];if(!r)fail(404,'Không tìm thấy quầy');branchAccess(req,r.branch_id);
  ensure(!(await openShift(registerId,conn)),'Quầy đang có ca mở hoặc chờ duyệt');
  if(req.user.role==='CASHIER'){
   const present=await query(`SELECT sa.id FROM shift_assignments sa JOIN work_shifts ws ON ws.id=sa.shift_id
    JOIN attendance a ON a.assignment_id=sa.id WHERE sa.user_id=? AND ws.branch_id=? AND sa.status='ASSIGNED'
    AND ws.job_role='CASHIER' AND a.check_in IS NOT NULL AND a.check_out IS NULL AND NOW() BETWEEN DATE_SUB(ws.starts_at,INTERVAL 60 MINUTE) AND ws.ends_at LIMIT 1`,[req.user.id,r.branch_id],conn);
   ensure(present.length,'Thu ngân phải được phân ca và check-in trước khi mở ca');
  }
  const previous=await lastShift(registerId,conn);
  const previousCash=Number(previous?.kept_cash||0);
  ensure(Math.abs(opening-previousCash)<0.01||String(req.body.opening_note||'').trim().length>=5,'Chênh lệch đầu ca: bắt buộc nhập lý do');
  const result=await query('INSERT INTO cash_shifts (branch_id,register_id,cashier_id,opening_cash,previous_cash,opening_note) VALUES (?,?,?,?,?,?)',[r.branch_id,r.id,req.user.id,opening,previousCash,req.body.opening_note||null],conn);
  await query("UPDATE branches SET status='OPEN' WHERE id=?",[r.branch_id],conn);
  await audit(conn,req.user.id,r.branch_id,'REGISTER_OPEN','cash_shift',result.insertId,{opening});return result.insertId;
 });ok(res,{id},201);
});
exports.pause=wrap(async(req,res)=>{
 const status=req.body.status;ensure(['OPEN','PAUSED'].includes(status),'Chỉ được tạm khóa hoặc mở lại ca');
 const id=number(req.params.id,'Ca bán',{min:1,integer:true});
 await transaction(async conn=>{
  const s=(await query('SELECT * FROM cash_shifts WHERE id=? FOR UPDATE',[id],conn))[0];if(!s)fail(404,'Không tìm thấy ca');branchAccess(req,s.branch_id);
  ensure(s.cashier_id===req.user.id||['ADMIN','BRANCH_MANAGER'].includes(req.user.role),'Không sở hữu ca');
  ensure(['OPEN','PAUSED'].includes(s.status),'Ca không thể tạm khóa');
  await query('UPDATE cash_shifts SET status=? WHERE id=?',[status,id],conn);
 });ok(res,{id,status});
});
exports.movement=wrap(async(req,res)=>{
 const id=number(req.params.id,'Ca bán',{min:1,integer:true});const amount=number(req.body.amount,'Số tiền',{min:1});
 ensure(['IN','OUT'].includes(req.body.direction),'Loại thu/chi không hợp lệ');ensure(String(req.body.reason||'').trim().length>=5,'Bắt buộc nhập lý do');
 await transaction(async conn=>{
  const s=(await query('SELECT * FROM cash_shifts WHERE id=? FOR UPDATE',[id],conn))[0];if(!s)fail(404,'Không tìm thấy ca');branchAccess(req,s.branch_id);ensure(s.status==='OPEN','Ca chưa mở');
  ensure(s.cashier_id===req.user.id||['ADMIN','BRANCH_MANAGER'].includes(req.user.role),'Không sở hữu ca');
  ensure(amount<=500000||req.user.role!=='CASHIER','Khoản thu/chi trên 500.000đ cần quản lý thực hiện/duyệt trực tiếp');
  await query('INSERT INTO cash_movements(cash_shift_id,direction,amount,reason,entered_by,approved_by) VALUES (?,?,?,?,?,?)',[id,req.body.direction,amount,req.body.reason,req.user.id,req.user.role==='CASHIER'?null:req.user.id],conn);
  await audit(conn,req.user.id,s.branch_id,'CASH_MOVEMENT','cash_shift',id,{amount,direction:req.body.direction});
 });ok(res,{id});
});
exports.summary=wrap(async(req,res)=>{
 const s=(await query('SELECT * FROM cash_shifts WHERE id=?',[req.params.id]))[0];if(!s)fail(404,'Không tìm thấy ca');branchAccess(req,s.branch_id);
 const values=await cashSummary(s.id);
 ok(res,{shift:s,...values,expected_cash:calcCashExpected({opening:s.opening_cash,cashSales:values.cash_sales,cashRefunds:values.cash_refunds,cashIn:values.cash_in,cashOut:values.cash_out})});
});
exports.close=wrap(async(req,res)=>{
 const id=number(req.params.id,'Ca bán',{min:1,integer:true});const counted=number(req.body.closing_cash,'Tiền thực tế');
 const output=await transaction(async conn=>{
  const s=(await query('SELECT * FROM cash_shifts WHERE id=? FOR UPDATE',[id],conn))[0];if(!s)fail(404,'Không tìm thấy ca');branchAccess(req,s.branch_id);
  ensure(s.cashier_id===req.user.id||['ADMIN','BRANCH_MANAGER'].includes(req.user.role),'Không sở hữu ca');ensure(['OPEN','PAUSED'].includes(s.status),'Ca không ở trạng thái cho phép đóng');
  const pending=(await query("SELECT COUNT(*) n FROM orders WHERE cash_shift_id=? AND status NOT IN ('COMPLETED','CANCELLED')",[id],conn))[0].n;
  ensure(!pending,'Còn đơn chưa thanh toán, chưa giao hoặc chưa hoàn tất');
  const sums=await cashSummary(id,conn);
  const expected=calcCashExpected({opening:s.opening_cash,cashSales:sums.cash_sales,cashRefunds:sums.cash_refunds,cashIn:sums.cash_in,cashOut:sums.cash_out});
  const discrepancy=counted-expected;
  ensure(Math.abs(discrepancy)<0.01||String(req.body.closing_note||'').trim().length>=5,'Có chênh lệch, bắt buộc nhập giải trình');
  await query("UPDATE cash_shifts SET closing_cash=?,expected_cash=?,discrepancy=?,closing_note=?,closed_at=NOW(),status='PENDING_APPROVAL' WHERE id=?",[counted,expected,discrepancy,req.body.closing_note||null,id],conn);
  await audit(conn,req.user.id,s.branch_id,'REGISTER_CLOSE_SUBMITTED','cash_shift',id,{expected,counted,discrepancy});
  return {id,expected_cash:expected,closing_cash:counted,discrepancy,status:'PENDING_APPROVAL'};
 });ok(res,output);
});
exports.approve=wrap(async(req,res)=>{
 const id=number(req.params.id,'Ca bán',{min:1,integer:true});const kept=number(req.body.kept_cash,'Tiền giữ lại');const deposited=number(req.body.deposited_cash,'Tiền nộp quỹ');
 await transaction(async conn=>{
  const s=(await query('SELECT * FROM cash_shifts WHERE id=? FOR UPDATE',[id],conn))[0];if(!s)fail(404,'Không tìm thấy ca');branchAccess(req,s.branch_id);ensure(s.status==='PENDING_APPROVAL','Ca chưa gửi duyệt');
  ensure(Math.abs((kept+deposited)-Number(s.closing_cash))<0.01,'Tiền giữ lại + tiền nộp phải bằng thực tế');
  await query("UPDATE cash_shifts SET status='CLOSED',approved_by=?,kept_cash=?,deposited_cash=? WHERE id=?",[req.user.id,kept,deposited,id],conn);
  const remaining=(await query("SELECT COUNT(*) AS n FROM cash_shifts WHERE branch_id=? AND status IN ('OPEN','PAUSED','PENDING_APPROVAL')",[s.branch_id],conn))[0].n;
  if(!remaining){
   const pendingOrders=(await query("SELECT COUNT(*) AS n FROM orders WHERE branch_id=? AND status IN ('PENDING_PAYMENT','CONFIRMED','PREPARING','READY','DELIVERING')",[s.branch_id],conn))[0].n;
   await query('UPDATE branches SET status=? WHERE id=?',[pendingOrders?'PAUSED':'CLOSED',s.branch_id],conn);
  }
  await audit(conn,req.user.id,s.branch_id,'REGISTER_APPROVE','cash_shift',id,{kept,deposited});
 });ok(res,{id,status:'CLOSED'});
});
