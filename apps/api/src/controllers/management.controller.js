const bcrypt=require('bcryptjs');
const {query,transaction}=require('../config/db');
const {wrap,ok,ensure,number,fail}=require('../utils/http');
const {branchAccess}=require('../middleware/auth');
const {audit}=require('../services/audit.service');
exports.branchStatus=wrap(async(req,res)=>{
 const id=number(req.params.id,'Chi nhánh',{min:1,integer:true});branchAccess(req,id);
 const status=req.body.status;ensure(['OPEN','CLOSED','PAUSED'].includes(status),'Trạng thái chi nhánh không hợp lệ');
 await transaction(async conn=>{
  const branch=(await query('SELECT * FROM branches WHERE id=? FOR UPDATE',[id],conn))[0];if(!branch)fail(404,'Không có chi nhánh');
  if(status==='OPEN'){
   const count=(await query("SELECT COUNT(*) AS n FROM cash_shifts WHERE branch_id=? AND status='OPEN'",[id],conn))[0].n;
   ensure(count,'Phải mở ca thu ngân trước khi mở cửa');
  }
  await query('UPDATE branches SET status=? WHERE id=?',[status,id],conn);
  await audit(conn,req.user.id,id,'BRANCH_STATUS','branch',id,{status});
 });ok(res,{id,status});
});
exports.logs=wrap(async(req,res)=>{
 const requestedBranch=Number(req.query.branch_id||0);
 if(requestedBranch)branchAccess(req,requestedBranch);
 // Không cho phép quản lý chi nhánh bỏ branch_id để đọc nhật ký toàn chuỗi.
 const branchId=req.user.role==='ADMIN'?requestedBranch:Number(req.user.branch_id);
 const logs=await query(`SELECT a.*,u.name AS actor_name,b.name AS branch_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
 LEFT JOIN branches b ON b.id=a.branch_id ${branchId?'WHERE a.branch_id=?':''} ORDER BY a.id DESC LIMIT 100`,branchId?[branchId]:[]);
 ok(res,logs);
});
exports.report=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||req.user.branch_id||1,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const date=String(req.query.date||new Date().toISOString().slice(0,10));ensure(/^\d{4}-\d{2}-\d{2}$/.test(date),'Ngày không hợp lệ');
 const [totals]=await query(`SELECT COUNT(*) orders,COALESCE(SUM(CASE WHEN payment_status='PAID' THEN total ELSE 0 END),0) revenue,
 COALESCE(SUM(discount),0) discounts,COUNT(CASE WHEN status='CANCELLED' THEN 1 END) cancellations
 FROM orders WHERE branch_id=? AND DATE(created_at)=?`,[branchId,date]);
 const byMethod=await query(`SELECT p.method,SUM(CASE WHEN p.direction='CHARGE' THEN p.amount ELSE -p.amount END) AS net_total
 FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.branch_id=? AND DATE(p.created_at)=? AND p.status='SUCCESS' GROUP BY p.method`,[branchId,date]);
 const items=await query(`SELECT oi.product_name,SUM(oi.quantity) qty FROM order_items oi JOIN orders o ON o.id=oi.order_id
 WHERE o.branch_id=? AND DATE(o.created_at)=? AND o.status<>'CANCELLED' GROUP BY oi.product_name ORDER BY qty DESC LIMIT 10`,[branchId,date]);
 const shifts=await query('SELECT id,opening_cash,closing_cash,expected_cash,discrepancy,status FROM cash_shifts WHERE branch_id=? AND DATE(opened_at)=?',[branchId,date]);
 ok(res,{date,totals,byMethod,items,shifts});
});
exports.createEmployee=wrap(async(req,res)=>{
 const {name,email,password,role}=req.body;
 ensure(String(name||'').trim().length>=2,'Tên không hợp lệ');ensure(/^\S+@\S+\.\S+$/.test(String(email||'')),'Email không hợp lệ');ensure(String(password||'').length>=10,'Mật khẩu tối thiểu 10 ký tự');
 ensure(['BRANCH_MANAGER','CASHIER','BARISTA'].includes(role),'Vai trò không hợp lệ');
 if(req.user.role==='BRANCH_MANAGER')ensure(role!=='BRANCH_MANAGER','Không được tự tạo quản lý');
 const branchId=number(req.body.branch_id||req.user.branch_id,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const hash=await bcrypt.hash(password,12);
 const result=await query('INSERT INTO users(name,email,password_hash,role,branch_id,phone) VALUES (?,?,?,?,?,?)',[name,String(email).toLowerCase(),hash,role,branchId,req.body.phone||null]);
 ok(res,{id:result.insertId},201);
});
