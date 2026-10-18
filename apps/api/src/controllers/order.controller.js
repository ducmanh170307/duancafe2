const {query,transaction}=require('../config/db');
const model=require('../models/order.model');
const svc=require('../services/order.service');
const {wrap,ok,ensure,number,fail}=require('../utils/http');
const {branchAccess}=require('../middleware/auth');
const {audit}=require('../services/audit.service');
exports.createPOS=wrap(async(req,res)=>{
 const order=await svc.createOrder({body:req.body,actor:req.user,source:'POS'});
 ok(res,order,201);
});
exports.createPublic=wrap(async(req,res)=>{
 ensure(String(req.body.guest_phone||'').trim().length>=9,'Cần số điện thoại để theo dõi đơn');
 ensure(String(req.body.guest_name||'').trim().length>=2,'Cần tên người nhận');
 const order=await svc.createOrder({body:req.body,actor:req.user?.role==='CUSTOMER'?req.user:null,source:'WEB'});
 // Đơn 0đ đã được chốt bằng coupon/điểm: không cần gọi cổng thu tiền.
 if(order.status==='CONFIRMED')return ok(res,{...order,mode:'NO_PAYMENT_REQUIRED'},201);
 if(req.body.payment_mode==='DEMO'){
  try {const result=await svc.payOrder({orderId:order.id,method:'DEMO',publicDemo:true,orderCode:order.order_code});
   return ok(res,{...order,payment:result,status:result.status,mode:'DEMO'},201);
  } catch(e){
   // Don da tao. Tra ma de khach hang co the tra cuu, thanh toan lai.
   return res.status(202).json({success:true,data:{...order,payment_error:e.message,mode:'PENDING'}});
  }
 }
 return ok(res,{...order,mode:'PAY_AT_PICKUP',notice:'Đơn chờ thanh toán; chỉ chuyển pha chế sau khi thu đủ tiền.'},201);
});
exports.pay=wrap(async(req,res)=>{
 const result=await svc.payOrder({orderId:number(req.params.id,'Mã đơn',{min:1,integer:true}),method:req.body.method,amount:req.body.amount,actor:req.user,cashShiftId:req.body.cash_shift_id});ok(res,result);
});
exports.list=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||req.user.branch_id||1,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 ok(res,await model.listOrders(branchId,{status:req.query.status||undefined,source:req.query.source||undefined}));
});
exports.detail=wrap(async(req,res)=>{
 const data=await model.detail(req.params.id);if(!data)fail(404,'Không tìm thấy đơn');branchAccess(req,data.branch_id);ok(res,data);
});
exports.lookup=wrap(async(req,res)=>{
 const phone=String(req.query.phone||'').trim();ensure(phone.length>=9,'Cần nhập số điện thoại đã đặt');
 const order=(await query('SELECT id FROM orders WHERE order_code=? AND guest_phone=? AND source=?',[req.params.code,phone,'WEB']))[0];
 if(!order)fail(404,'Không tìm thấy đơn phù hợp');const detail=await model.detail(order.id);
 // Không trả về thông tin thanh toán nội bộ khi tra cứu công khai
 ok(res,{order_code:detail.order_code,status:detail.status,payment_status:detail.payment_status,queue_number:detail.queue_number,total:detail.total,items:detail.items.map(i=>({product_name:i.product_name,size:i.size,quantity:i.quantity})),created_at:detail.created_at});
});
exports.kds=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||req.user.branch_id||1,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const orders=await query(`SELECT id,order_code,queue_number,source,order_type,status,created_at,requested_at,note FROM orders
  WHERE branch_id=? AND status IN ('CONFIRMED','PREPARING','READY','DELIVERING') AND (requested_at IS NULL OR requested_at<=DATE_ADD(NOW(),INTERVAL 15 MINUTE)) ORDER BY CASE WHEN requested_at IS NOT NULL THEN 0 WHEN order_type='DELIVERY' THEN 1 ELSE 2 END,created_at LIMIT 70`,[branchId]);
 const ids=orders.map(o=>o.id);
 const items=ids.length?await query(`SELECT oi.*,c.name AS category_name FROM order_items oi JOIN product_variants v ON v.id=oi.variant_id JOIN products p ON p.id=v.product_id JOIN categories c ON c.id=p.category_id WHERE oi.order_id IN (?)`,[ids]):[];
 ok(res,orders.map(o=>({...o,items:items.filter(i=>i.order_id===o.id)})));
});
exports.updateStatus=wrap(async(req,res)=>{
 const next=req.body.status;
 const transitions={CONFIRMED:['PREPARING'],PREPARING:['READY'],READY:['COMPLETED','DELIVERING'],DELIVERING:['COMPLETED']};
 const result=await transaction(async conn=>{
  const o=(await query('SELECT * FROM orders WHERE id=? FOR UPDATE',[req.params.id],conn))[0];if(!o)fail(404,'Không tìm thấy đơn');branchAccess(req,o.branch_id);
  ensure((transitions[o.status]||[]).includes(next),'Không thể chuyển trạng thái theo hướng này');
  ensure(next!=='DELIVERING'||o.order_type==='DELIVERY','Chỉ đơn giao hàng mới có trạng thái đang giao');
  ensure(!(next==='COMPLETED'&&o.order_type==='DELIVERY'&&o.status==='READY'),'Cần chuyển Đang giao trước khi Hoàn tất');
  await query('UPDATE orders SET status=? WHERE id=?',[next,o.id],conn);
  await audit(conn,req.user.id,o.branch_id,'ORDER_STATUS','order',o.id,{from:o.status,to:next});
  return {id:o.id,status:next};
 });ok(res,result);
});
exports.remake=wrap(async(req,res)=>{
 const itemId=number(req.body.item_id,'Mã món',{min:1,integer:true});const qty=number(req.body.quantity||1,'Số ly làm lại',{min:1,integer:true});
 ensure(String(req.body.reason||'').trim().length>=5,'Cần lý do pha lại');
 await transaction(async conn=>{
  const o=(await query('SELECT * FROM orders WHERE id=? FOR UPDATE',[req.params.id],conn))[0];if(!o)fail(404,'Không tìm thấy đơn');branchAccess(req,o.branch_id);
  ensure(['PREPARING','READY'].includes(o.status),'Chỉ làm lại khi đơn đang pha/đã pha');
  const item=(await query('SELECT * FROM order_items WHERE id=? AND order_id=?',[itemId,o.id],conn))[0];if(!item)fail(404,'Không tìm thấy món');ensure(qty<=item.quantity,'Số ly làm lại vượt số ly của món');
  await svc.changeStock(conn,o.branch_id,o.id,[{...item,quantity:qty}],-1,req.user.id,'WASTE');
  await query('UPDATE order_items SET remake_count=remake_count+? WHERE id=?',[qty,itemId],conn);
  await audit(conn,req.user.id,o.branch_id,'ORDER_REMAKE','order_item',itemId,{reason:req.body.reason,qty});
 });ok(res,{item_id:itemId,quantity:qty});
});
exports.cancel=wrap(async(req,res)=>ok(res,await svc.cancelOrder({orderId:Number(req.params.id),actor:req.user,reason:req.body.reason})));
exports.receipt=wrap(async(req,res)=>{
 const detail=await model.detail(req.params.id);if(!detail)fail(404,'Không tìm thấy đơn');branchAccess(req,detail.branch_id);
 ok(res,{...detail,invoice_notice:'Đây là phiếu bán hàng nội bộ, KHÔNG phải hóa đơn điện tử có giá trị pháp lý. Tích hợp nhà cung cấp hóa đơn điện tử riêng.'});
});
exports.queue=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||1,'Chi nhánh',{min:1,integer:true});
 ok(res,await query("SELECT queue_number,status FROM orders WHERE branch_id=? AND DATE(created_at)=CURDATE() AND status IN ('PREPARING','READY') ORDER BY id DESC LIMIT 30",[branchId]));
});
