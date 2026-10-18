const {query,transaction}=require('../config/db');
const model=require('../models/inventory.model');
const {wrap,ok,ensure,number,fail}=require('../utils/http');
const {branchAccess}=require('../middleware/auth');
const {audit}=require('../services/audit.service');
exports.list=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||req.user.branch_id||1,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const [items,receipts,alerts,suppliers]=await Promise.all([model.inventory(branchId),model.receipts(branchId),model.alerts(branchId),query('SELECT * FROM suppliers ORDER BY name')]);
 ok(res,{items,receipts,alerts,suppliers});
});
exports.createIngredient=wrap(async(req,res)=>{
 const name=String(req.body.name||'').trim();ensure(name.length>=2,'Tên nguyên liệu quá ngắn');
 const unit=String(req.body.unit||'').trim();ensure(unit.length>=1,'Cần đơn vị');
 const result=await query('INSERT INTO ingredients(name,unit,min_quantity) VALUES (?,?,?)',[name,unit,number(req.body.min_quantity??0,'Định mức')]);ok(res,{id:result.insertId},201);
});
exports.createSupplier=wrap(async(req,res)=>{
 const name=String(req.body.name||'').trim();ensure(name.length>=2,'Tên nhà cung cấp quá ngắn');
 const result=await query('INSERT INTO suppliers(name,phone) VALUES (?,?)',[name,req.body.phone||null]);ok(res,{id:result.insertId},201);
});
exports.createReceipt=wrap(async(req,res)=>{
 const branchId=number(req.body.branch_id||req.user.branch_id,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const lines=req.body.lines;ensure(Array.isArray(lines)&&lines.length>0&&lines.length<=100,'Cần ít nhất một dòng nguyên liệu');
 let total=0;
 for(const l of lines){number(l.ingredient_id,'Nguyên liệu',{min:1,integer:true});number(l.quantity,'Số lượng',{min:0.001});number(l.unit_cost,'Đơn giá');total+=Number(l.quantity)*Number(l.unit_cost);
  if(l.expires_at)ensure(!Number.isNaN(Date.parse(l.expires_at))&&new Date(l.expires_at)>=new Date(new Date().toISOString().slice(0,10)),'Hạn dùng không hợp lệ');}
 const id=await transaction(async conn=>{
  const receipt=await query(`INSERT INTO stock_receipts(branch_id,supplier_id,source_type,invoice_url,total_cost,status,created_by)
   VALUES (?,?,?,?,?,'DRAFT',?)`,[branchId,req.body.supplier_id||null,req.body.source_type||'SUPPLIER',req.body.invoice_url||null,total,req.user.id],conn);
  for(const l of lines)await query('INSERT INTO stock_receipt_lines(receipt_id,ingredient_id,quantity,unit_cost,lot_code,expires_at) VALUES (?,?,?,?,?,?)',[receipt.insertId,l.ingredient_id,l.quantity,l.unit_cost,l.lot_code||null,l.expires_at||null],conn);
  await audit(conn,req.user.id,branchId,'RECEIPT_CREATE','stock_receipt',receipt.insertId,{total});
  return receipt.insertId;
 });ok(res,{id,total_cost:total},201);
});
exports.submitReceipt=wrap(async(req,res)=>{
 await transaction(async conn=>{
  const r=(await query('SELECT * FROM stock_receipts WHERE id=? FOR UPDATE',[req.params.id],conn))[0];if(!r)fail(404,'Không tìm thấy phiếu');branchAccess(req,r.branch_id);ensure(r.status==='DRAFT','Phiếu đã nộp hoặc xác nhận');
  await query("UPDATE stock_receipts SET status='PENDING_APPROVAL' WHERE id=?",[r.id],conn);
 });ok(res,{status:'PENDING_APPROVAL'});
});
exports.confirmReceipt=wrap(async(req,res)=>{
 const id=number(req.params.id,'Phiếu nhập',{min:1,integer:true});
 const output=await transaction(async conn=>{
  const r=(await query('SELECT * FROM stock_receipts WHERE id=? FOR UPDATE',[id],conn))[0];if(!r)fail(404,'Không tìm thấy phiếu nhập');branchAccess(req,r.branch_id);
  ensure(['DRAFT','PENDING_APPROVAL'].includes(r.status),'Phiếu đã chốt không thể sửa');
  ensure(Number(r.total_cost)<=5000000||req.user.role==='ADMIN','Phiếu trên 5.000.000đ cần chủ chuỗi duyệt');
  const lines=await query('SELECT * FROM stock_receipt_lines WHERE receipt_id=? ORDER BY ingredient_id',[id],conn);
  for(const line of lines){
   const old=(await query('SELECT * FROM branch_inventory WHERE branch_id=? AND ingredient_id=? FOR UPDATE',[r.branch_id,line.ingredient_id],conn))[0];
   const oldQty=Number(old?.quantity||0),add=Number(line.quantity);
   const newCost=(oldQty*Number(old?.avg_cost||0)+add*Number(line.unit_cost))/(oldQty+add);
   await query(`INSERT INTO branch_inventory(branch_id,ingredient_id,quantity,avg_cost) VALUES (?,?,?,?)
   ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)+quantity,avg_cost=VALUES(avg_cost)`,[r.branch_id,line.ingredient_id,add,newCost],conn);
   if(line.lot_code)await query('INSERT INTO inventory_lots(branch_id,ingredient_id,lot_code,expires_at,quantity_remaining,unit_cost) VALUES (?,?,?,?,?,?)',[r.branch_id,line.ingredient_id,line.lot_code,line.expires_at,add,line.unit_cost],conn);
   await query('INSERT INTO stock_movements(branch_id,ingredient_id,quantity_delta,movement_type,reference_type,reference_id,actor_id) VALUES (?,?,?,?,?,?,?)',[r.branch_id,line.ingredient_id,add,'RECEIPT','RECEIPT',id,req.user.id],conn);
  }
  await query("UPDATE stock_receipts SET status='CONFIRMED',confirmed_at=NOW(),approved_by=? WHERE id=?",[req.user.id,id],conn);
  await audit(conn,req.user.id,r.branch_id,'RECEIPT_CONFIRM','stock_receipt',id,{total:r.total_cost});
  return {id,status:'CONFIRMED'};
 });ok(res,output);
});
exports.adjust=wrap(async(req,res)=>{
 const branchId=number(req.body.branch_id||req.user.branch_id,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const ingredientId=number(req.body.ingredient_id,'Nguyên liệu',{min:1,integer:true});const counted=number(req.body.counted_quantity,'Số lượng kiểm kê');
 ensure(String(req.body.reason||'').trim().length>=5,'Bắt buộc ghi lý do chênh lệch');
 const data=await transaction(async conn=>{
  const old=(await query('SELECT * FROM branch_inventory WHERE branch_id=? AND ingredient_id=? FOR UPDATE',[branchId,ingredientId],conn))[0];
  const delta=counted-Number(old?.quantity||0);
  await query('INSERT INTO branch_inventory(branch_id,ingredient_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)',[branchId,ingredientId,counted],conn);
  await query('INSERT INTO stock_movements(branch_id,ingredient_id,quantity_delta,movement_type,reference_type,reference_id,actor_id) VALUES (?,?,?,?,?,?,?)',[branchId,ingredientId,delta,'ADJUSTMENT','COUNT',ingredientId,req.user.id],conn);
  await audit(conn,req.user.id,branchId,'STOCK_COUNT_APPROVED','ingredient',ingredientId,{counted,delta,reason:req.body.reason});return {ingredient_id:ingredientId,delta,counted};
 });ok(res,data);
});
exports.transfers=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||req.user.branch_id||1,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 ok(res,await query(`SELECT st.*,b1.name AS from_name,b2.name AS to_name FROM stock_transfers st JOIN branches b1 ON b1.id=st.from_branch_id JOIN branches b2 ON b2.id=st.to_branch_id
 WHERE st.from_branch_id=? OR st.to_branch_id=? ORDER BY id DESC LIMIT 50`,[branchId,branchId]));
});
exports.transfer=wrap(async(req,res)=>{
 const from=number(req.body.from_branch_id||req.user.branch_id,'Kho xuất',{min:1,integer:true});const to=number(req.body.to_branch_id,'Kho nhận',{min:1,integer:true});
 ensure(from!==to,'Không thể chuyển cùng chi nhánh');branchAccess(req,from);
 const lines=req.body.lines;ensure(Array.isArray(lines)&&lines.length>0,'Cần hàng cần chuyển');
 const id=await transaction(async conn=>{
  const r=await query('INSERT INTO stock_transfers(from_branch_id,to_branch_id,created_by) VALUES (?,?,?)',[from,to,req.user.id],conn);
  for(const l of [...lines].sort((a,b)=>Number(a.ingredient_id)-Number(b.ingredient_id))){
   const ingredient=number(l.ingredient_id,'Nguyên liệu',{min:1,integer:true});const qty=number(l.quantity,'Số lượng',{min:0.001});
   const changed=await query('UPDATE branch_inventory SET quantity=quantity-? WHERE branch_id=? AND ingredient_id=? AND quantity>=?',[qty,from,ingredient,qty],conn);
   ensure(changed.affectedRows===1,`Không đủ nguyên liệu #${ingredient}`,409);
   await query('INSERT INTO stock_transfer_lines VALUES (?,?,?)',[r.insertId,ingredient,qty],conn);
   await query('INSERT INTO stock_movements(branch_id,ingredient_id,quantity_delta,movement_type,reference_type,reference_id,actor_id) VALUES (?,?,?,?,?,?,?)',[from,ingredient,-qty,'TRANSFER_OUT','TRANSFER',r.insertId,req.user.id],conn);
  }
  await audit(conn,req.user.id,from,'TRANSFER_SEND','transfer',r.insertId,{to});return r.insertId;
 });ok(res,{id,status:'IN_TRANSIT'},201);
});
exports.receiveTransfer=wrap(async(req,res)=>{
 const id=number(req.params.id,'Mã chuyển kho',{min:1,integer:true});
 await transaction(async conn=>{
  const t=(await query('SELECT * FROM stock_transfers WHERE id=? FOR UPDATE',[id],conn))[0];if(!t)fail(404,'Không tìm thấy phiếu');branchAccess(req,t.to_branch_id);ensure(t.status==='IN_TRANSIT','Phiếu đã nhận');
  const lines=await query('SELECT * FROM stock_transfer_lines WHERE transfer_id=?',[id],conn);
  for(const l of lines){
   await query('INSERT INTO branch_inventory(branch_id,ingredient_id,quantity,avg_cost) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[t.to_branch_id,l.ingredient_id,l.quantity],conn);
   await query('INSERT INTO stock_movements(branch_id,ingredient_id,quantity_delta,movement_type,reference_type,reference_id,actor_id) VALUES (?,?,?,?,?,?,?)',[t.to_branch_id,l.ingredient_id,l.quantity,'TRANSFER_IN','TRANSFER',id,req.user.id],conn);
  }
  await query("UPDATE stock_transfers SET status='RECEIVED',received_by=? WHERE id=?",[req.user.id,id],conn);
  await audit(conn,req.user.id,t.to_branch_id,'TRANSFER_RECEIVE','transfer',id,{});
 });ok(res,{id,status:'RECEIVED'});
});
exports.history=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||req.user.branch_id||1,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 ok(res,await query(`SELECT sm.*,i.name AS ingredient_name,i.unit FROM stock_movements sm JOIN ingredients i ON i.id=sm.ingredient_id
 WHERE sm.branch_id=? ORDER BY sm.id DESC LIMIT 100`,[branchId]));
});
