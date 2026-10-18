const crypto=require('node:crypto');
const {query,transaction}=require('../config/db');
const {ensure,fail,number}=require('../utils/http');
const {computeOrder}=require('../utils/rules');
const {findPromotion,redeemPromotion}=require('./promotion.service');
const {audit}=require('./audit.service');
const {menu}=require('../models/menu.model');
async function itemDetails(items,branchId,conn){
 ensure(Array.isArray(items)&&items.length>0&&items.length<=40,'Cần 1–40 dòng món');
 const payload=[];
 for(const item of items){
  const variantId=number(item.variant_id,'Size món',{min:1,integer:true});
  const qty=number(item.quantity,'Số lượng',{min:1,integer:true});ensure(qty<=30,'Không vượt 30 sản phẩm mỗi dòng');
  const v=(await query(`SELECT v.id,v.size,v.product_id,COALESCE(vp.price,v.price) price,p.name,
  COALESCE(bp.available,1) branch_available FROM product_variants v JOIN products p ON p.id=v.product_id
  LEFT JOIN branch_variant_prices vp ON vp.variant_id=v.id AND vp.branch_id=?
  LEFT JOIN branch_products bp ON bp.product_id=p.id AND bp.branch_id=?
  WHERE v.id=? AND v.active=1 AND p.status='ACTIVE'`,[branchId,branchId,variantId],conn))[0];
  ensure(v&&v.branch_available,'Món không còn bán tại chi nhánh');
  const toppingIds=(item.topping_ids||[]).map(x=>number(x,'Topping',{min:1,integer:true}));ensure(toppingIds.length<=8&&new Set(toppingIds).size===toppingIds.length,'Topping không hợp lệ');
  let toppings=[];
  if(toppingIds.length){
   toppings=await query('SELECT id,name,price FROM toppings WHERE active=1 AND id IN (?)',[toppingIds],conn);
   ensure(toppings.length===toppingIds.length,'Topping không hợp lệ hoặc đã ngừng bán');
  }
  const unitPrice=Number(v.price)+toppings.reduce((sum,t)=>sum+Number(t.price),0);
  payload.push({variant_id:v.id,product_id:v.product_id,product_name:v.name,size:v.size,unit_price:unitPrice,quantity:qty,
   options_json:JSON.stringify({sugar:String(item.sugar||'100%').slice(0,20),ice:String(item.ice||'100%').slice(0,20),toppings:toppings.map(t=>({id:t.id,name:t.name,price:t.price}))}),
   note:String(item.note||'').slice(0,250),line_total:unitPrice*qty});
 }
 return payload;
}
async function ingredientNeeds(conn,rows){
 const map=new Map();
 for(const row of rows){
  const recipe=await query('SELECT ingredient_id,quantity FROM recipes WHERE variant_id=?',[row.variant_id],conn);
  for(const r of recipe)map.set(r.ingredient_id,(map.get(r.ingredient_id)||0)+Number(r.quantity)*row.quantity);
  const options=typeof row.options_json==='string'?JSON.parse(row.options_json):row.options_json;
  for(const top of options?.toppings||[]){
   const tr=await query('SELECT ingredient_id,quantity FROM topping_recipes WHERE topping_id=?',[top.id],conn);
   for(const r of tr)map.set(r.ingredient_id,(map.get(r.ingredient_id)||0)+Number(r.quantity)*row.quantity);
  }
 }
 return [...map.entries()].sort((a,b)=>Number(a[0])-Number(b[0])).map(([ingredientId,quantity])=>({ingredientId,quantity:Math.round(quantity*1000)/1000}));
}
async function changeStock(conn,branchId,orderId,rows,direction,actorId,kind){
 const needs=await ingredientNeeds(conn,rows);
 for(const {ingredientId,quantity} of needs){
  const row=(await query('SELECT quantity FROM branch_inventory WHERE branch_id=? AND ingredient_id=? FOR UPDATE',[branchId,ingredientId],conn))[0];
  if(direction<0){
   const expired=(await query('SELECT COALESCE(SUM(quantity_remaining),0) AS n FROM inventory_lots WHERE branch_id=? AND ingredient_id=? AND expires_at<CURDATE()',[branchId,ingredientId],conn))[0].n;
   ensure(row&&Number(row.quantity)-Number(expired)>=quantity,`Không đủ nguyên liệu khả dụng #${ingredientId} (đã trừ lô hết hạn)`,409);
   const result=await query('UPDATE branch_inventory SET quantity=quantity-? WHERE branch_id=? AND ingredient_id=? AND quantity>=?',[quantity,branchId,ingredientId,quantity],conn);
   ensure(result.affectedRows===1,'Kho vừa thay đổi, vui lòng kiểm tra lại',409);
   const lots=await query('SELECT id,quantity_remaining FROM inventory_lots WHERE branch_id=? AND ingredient_id=? AND (expires_at IS NULL OR expires_at>=CURDATE()) AND quantity_remaining>0 ORDER BY expires_at IS NULL,expires_at,id FOR UPDATE',[branchId,ingredientId],conn);
   let left=quantity;
   for(const lot of lots){if(left<=0.000001)break;const used=Math.min(left,Number(lot.quantity_remaining));await query('UPDATE inventory_lots SET quantity_remaining=quantity_remaining-? WHERE id=?',[used,lot.id],conn);left=Math.max(0,Math.round((left-used)*1000)/1000);}
  }else{
   await query(`INSERT INTO branch_inventory(branch_id,ingredient_id,quantity,avg_cost) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)`,[branchId,ingredientId,quantity],conn);
  }
  await query('INSERT INTO stock_movements(branch_id,ingredient_id,quantity_delta,movement_type,reference_type,reference_id,actor_id) VALUES (?,?,?,?,?,?,?)',[branchId,ingredientId,quantity*direction,kind,'ORDER',orderId,actorId||null],conn);
 }
}
async function calculate({body,branchId,source,customerId,conn}){
 const rows=await itemDetails(body.items,branchId,conn);
 const subtotal=rows.reduce((sum,item)=>sum+item.line_total,0);
 const deliveryFee=body.order_type==='DELIVERY'?Number(process.env.DEMO_DELIVERY_FEE||20000):0;
 // Phí giao hàng CỐ ĐỊNH trong demo, tính tại server; bản production tích hợp dịch vụ vận chuyển.
 const promo=await findPromotion({code:body.promo_code?String(body.promo_code).trim().toUpperCase():null,branchId,channel:source==='POS'?'POS':'WEB',customerId,subtotal,deliveryFee,items:rows},conn);
 let pointDiscount=0,pointsRedeemed=0;
 if(body.points_redeemed){
  ensure(customerId,'Cần tài khoản khách hàng để sử dụng điểm');
  const profile=(await query('SELECT points FROM customer_profiles WHERE user_id=?',[customerId],conn))[0];
  pointsRedeemed=number(body.points_redeemed,'Số điểm',{min:1,integer:true});
  ensure(profile&&profile.points>=pointsRedeemed,'Không đủ điểm tích lũy');
  // Mỗi điểm đổi đúng 100 VNĐ; không trừ điểm cho phần dư không đủ 100đ.
  const maxPoints=Math.floor(Math.max(0,subtotal-(promo?.promo.type==='FREE_SHIPPING'?0:(promo?.discount||0)))/100);
  pointsRedeemed=Math.min(pointsRedeemed,maxPoints);
  pointDiscount=pointsRedeemed*100;
 }
 const shippingDiscount=promo?.promo.type==='FREE_SHIPPING'?Math.min(deliveryFee,promo.discount):0;
 const merchandiseDiscount=Math.min(subtotal,(promo?.discount||0)-shippingDiscount+pointDiscount);
 const amounts=computeOrder({subtotal,discount:merchandiseDiscount,shippingDiscount,deliveryFee,taxRate:Number(process.env.VAT_RATE||0)});
 return {rows,promo,amounts,pointsRedeemed};
}
async function createOrder({body,actor,source}){
 return transaction(async conn=>{
  const branchId=number(body.branch_id||actor?.branch_id,'Chi nhánh',{min:1,integer:true});
  const branch=(await query('SELECT * FROM branches WHERE id=? FOR UPDATE',[branchId],conn))[0];
  if(!branch)fail(404,'Không tìm thấy chi nhánh');
  ensure(branch.status==='OPEN','Chi nhánh chưa mở cửa hoặc đang tạm dừng nhận đơn');
  const open=(await query("SELECT id FROM cash_shifts WHERE branch_id=? AND status='OPEN' LIMIT 1",[branchId],conn))[0];
  ensure(open,'Chi nhánh chưa mở ca bán hàng');
  let shiftId=null;
  if(source==='POS'){
   ensure(actor&&['CASHIER','BRANCH_MANAGER','ADMIN'].includes(actor.role),'Bạn không có quyền bán POS',403);
   if(actor.role!=='ADMIN')ensure(Number(actor.branch_id)===branchId,'Không đúng chi nhánh',403);
   shiftId=number(body.cash_shift_id,'Ca thu ngân',{min:1,integer:true});
   const shift=(await query("SELECT * FROM cash_shifts WHERE id=? AND branch_id=? AND status='OPEN'",[shiftId,branchId],conn))[0];
   ensure(shift&&(shift.cashier_id===actor.id||['ADMIN','BRANCH_MANAGER'].includes(actor.role)),'Không tìm thấy ca đang mở do bạn phụ trách',403);
  }
  ensure(['DINE_IN','TAKEAWAY','DELIVERY'].includes(body.order_type),'Loại đơn không hợp lệ');
  ensure(source==='POS'||body.order_type!=='DINE_IN','Web chỉ hỗ trợ mang đi hoặc giao hàng');
  const customerId=source==='POS'?body.customer_id||null:(actor?.role==='CUSTOMER'?actor.id:null);
  if(customerId){const u=(await query("SELECT id FROM users WHERE id=? AND role='CUSTOMER' AND active=1",[customerId],conn))[0];ensure(u,'Khách hàng không hợp lệ');}
  if(body.order_type==='DELIVERY')ensure(String(body.delivery_address||'').trim().length>=12,'Cần địa chỉ giao hàng');
  if(body.requested_at){
   const scheduled=new Date(String(body.requested_at).replace(' ','T')+'+07:00').getTime();
   ensure(Number.isFinite(scheduled)&&scheduled>=Date.now()-5*60000&&scheduled<=Date.now()+7*86400000,'Giờ nhận hẹn phải từ hiện tại đến tối đa 7 ngày');
  }
  const {rows,promo,amounts,pointsRedeemed}=await calculate({body,branchId,source,customerId,conn});
  const code=`BF${branchId}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const ins=await query(`INSERT INTO orders(order_code,branch_id,cash_shift_id,customer_id,created_by,source,order_type,
    subtotal,discount,tax,delivery_fee,total,promotion_id,points_redeemed,guest_name,guest_phone,delivery_address,requested_at,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
    code,branchId,shiftId,customerId,source==='POS'?actor.id:null,source,body.order_type,amounts.subtotal,amounts.discount,amounts.tax,amounts.delivery_fee,amounts.total,promo?.promo.id||null,pointsRedeemed,
    String(body.guest_name||'').slice(0,100)||null,String(body.guest_phone||'').slice(0,25)||null,body.delivery_address||null,body.requested_at||null,String(body.note||'').slice(0,350)||null
   ],conn);
  for(const i of rows)await query(`INSERT INTO order_items(order_id,variant_id,product_name,size,unit_price,quantity,options_json,note,line_total)
   VALUES (?,?,?,?,?,?,?,?,?)`,[ins.insertId,i.variant_id,i.product_name,i.size,i.unit_price,i.quantity,i.options_json,i.note,i.line_total],conn);
  // Đơn 0đ (100% giảm giá / dùng toàn bộ điểm) cần tự chốt, không thể ghi payment amount = 0.
  let status='PENDING_PAYMENT';
  if(amounts.total===0){
   await finalizePaid(conn,{id:ins.insertId,branch_id:branchId,customer_id:customerId,
    points_redeemed:pointsRedeemed,promotion_id:promo?.promo.id||null,total:0},actor?.id||null);
   status='CONFIRMED';
  }
  await audit(conn,actor?.id||null,branchId,'ORDER_CREATE','order',ins.insertId,{source,total:amounts.total});
  return {id:ins.insertId,order_code:code,...amounts,status,promotion:promo?.promo.name||null};
 });
}
async function finalizePaid(conn,order,actorId){
 const items=await query('SELECT * FROM order_items WHERE order_id=?',[order.id],conn);
 // Giữ kho ngay khi thanh toán đủ: ngăn nhận đơn vượt tồn; huỷ trước khi pha thì hoàn lại.
 await changeStock(conn,order.branch_id,order.id,items,-1,actorId,'SALE');
 await redeemPromotion(conn,order.promotion_id,order.id,order.customer_id);
 if(order.customer_id){
  const profile=(await query('SELECT * FROM customer_profiles WHERE user_id=? FOR UPDATE',[order.customer_id],conn))[0];
  ensure(profile&&profile.points>=order.points_redeemed,'Số điểm khả dụng đã thay đổi',409);
  const promotion=order.promotion_id?(await query('SELECT * FROM promotions WHERE id=?',[order.promotion_id],conn))[0]:null;
  const multiplier=promotion?.type==='POINTS_MULTIPLIER'?Math.max(1,Math.floor(promotion.value)):1;
  const earned=Math.floor(Number(order.total)/10000)*multiplier;
  // Tính bằng số điểm gốc đã khóa FOR UPDATE để tránh MySQL SET cập nhật points trước tier.
  const nextPoints=Number(profile.points)-Number(order.points_redeemed)+earned;
  const nextTier=nextPoints>=1000?'GOLD':nextPoints>=300?'SILVER':'BRONZE';
  await query('UPDATE customer_profiles SET points=?,tier=? WHERE user_id=?',[nextPoints,nextTier,order.customer_id],conn);
  if(order.points_redeemed)await query('INSERT INTO loyalty_ledger(customer_id,order_id,points_delta,reason) VALUES (?,?,?,?)',[order.customer_id,order.id,-order.points_redeemed,'Sử dụng điểm'],conn);
  if(earned)await query('INSERT INTO loyalty_ledger(customer_id,order_id,points_delta,reason) VALUES (?,?,?,?)',[order.customer_id,order.id,earned,'Điểm mua hàng'],conn);
  await query('UPDATE orders SET points_earned=? WHERE id=?',[earned,order.id],conn);
 }
 await query('INSERT INTO daily_sequences(branch_id,seq_date,next_no) VALUES (?,CURDATE(),LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE next_no=LAST_INSERT_ID(next_no+1)',[order.branch_id],conn);
 const sequence=(await query('SELECT LAST_INSERT_ID() AS n',[],conn))[0].n;
 await query("UPDATE orders SET status='CONFIRMED',payment_status='PAID',stock_deducted=1,queue_number=? WHERE id=?",[sequence,order.id],conn);
}
async function payOrder({orderId,amount,method,actor,publicDemo=false,cashShiftId=null}){
 return transaction(async conn=>{
  const order=(await query('SELECT * FROM orders WHERE id=? FOR UPDATE',[orderId],conn))[0];if(!order)fail(404,'Không tìm thấy đơn');
  ensure(['PENDING_PAYMENT'].includes(order.status),'Đơn không thể thanh toán');
  const total=Number(order.total);
  if(!publicDemo){
   ensure(actor&&['ADMIN','BRANCH_MANAGER','CASHIER'].includes(actor.role),'Không có quyền thanh toán',403);
   if(actor.role!=='ADMIN')ensure(Number(actor.branch_id)===Number(order.branch_id),'Khác chi nhánh',403);
   if(actor.role==='CASHIER'&&order.cash_shift_id)ensure(actor.id===(await query('SELECT cashier_id FROM cash_shifts WHERE id=?',[order.cash_shift_id],conn))[0]?.cashier_id,'Không phải ca của thu ngân');
  }else ensure(order.source==='WEB','Chỉ thanh toán thử nghiệm cho đơn Web');
  ensure(['CASH','DEMO'].includes(method),'Thẻ/QR/ví yêu cầu tích hợp cổng thanh toán và xác thực webhook');
  if(method==='DEMO')ensure(process.env.DEMO_PAYMENT_ENABLED==='true','Thanh toán thử nghiệm đang bị vô hiệu hóa');
  if(publicDemo)ensure(method==='DEMO','Khách chỉ có thể thanh toán demo qua web');
  if(method==='CASH'){
   ensure(!publicDemo,'Tiền mặt chỉ do nhân viên nhận tại quầy');
   const targetShift=order.cash_shift_id||number(cashShiftId,'Ca nhận tiền mặt',{min:1,integer:true});
   const shift=(await query('SELECT * FROM cash_shifts WHERE id=? FOR UPDATE',[targetShift],conn))[0];
   ensure(shift?.status==='OPEN'&&Number(shift.branch_id)===Number(order.branch_id),'Ca bán đã khóa hoặc khác chi nhánh');
   ensure(actor.role!=='CASHIER'||Number(shift.cashier_id)===Number(actor.id),'Thu ngân không sở hữu ca');
   if(!order.cash_shift_id){await query('UPDATE orders SET cash_shift_id=? WHERE id=?',[targetShift,order.id],conn);order.cash_shift_id=targetShift;}
  }
  const paid=(await query("SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE order_id=? AND status='SUCCESS' AND direction='CHARGE'",[order.id],conn))[0].n;
  const due=Math.round((total-Number(paid))*100)/100;
  ensure(due>0,'Đơn đã thanh toán đủ');
  const payAmount=amount===undefined?due:number(amount,'Số tiền thanh toán',{min:0.01});
  ensure(payAmount<=due,'Số tiền vượt số tiền còn phải trả');
  await query('INSERT INTO payments(order_id,cash_shift_id,method,direction,amount,status) VALUES (?,?,?,?,?,?)',[order.id,order.cash_shift_id,method,'CHARGE',payAmount,'SUCCESS'],conn);
  if(due-payAmount<=0.001){await finalizePaid(conn,order,actor?.id||null);}else await query("UPDATE orders SET payment_status='PARTIAL' WHERE id=?",[order.id],conn);
  await audit(conn,actor?.id||null,order.branch_id,'ORDER_PAYMENT','order',order.id,{method,payAmount});
  return {id:order.id,paid:Number(paid)+payAmount,due:Math.max(0,due-payAmount),status:due-payAmount<=0.001?'CONFIRMED':'PENDING_PAYMENT'};
 });
}
async function cancelOrder({orderId,actor,reason}){
 ensure(String(reason||'').trim().length>=5,'Hủy đơn cần ghi lý do');
 return transaction(async conn=>{
  const o=(await query('SELECT * FROM orders WHERE id=? FOR UPDATE',[orderId],conn))[0];if(!o)fail(404,'Không tìm thấy đơn');
  const isCustomer=actor?.role==='CUSTOMER'&&Number(o.customer_id)===actor.id;
  if(!isCustomer){ensure(actor&&['ADMIN','BRANCH_MANAGER','CASHIER'].includes(actor.role),'Không có quyền hủy',403);if(actor.role!=='ADMIN')ensure(actor.branch_id===o.branch_id,'Khác chi nhánh',403);}
  ensure(!['CANCELLED','COMPLETED','DELIVERING'].includes(o.status),'Đơn đã hoàn tất/hủy, không thể hủy');
  const wasPrepared=['PREPARING','READY'].includes(o.status);
  ensure(!wasPrepared||['ADMIN','BRANCH_MANAGER'].includes(actor?.role),'Đã bắt đầu pha chế, cần quản lý phê duyệt',403);
  const charged=await query("SELECT method,COALESCE(SUM(amount),0) amount FROM payments WHERE order_id=? AND status='SUCCESS' AND direction='CHARGE' GROUP BY method",[o.id],conn);
  // Chỉ hoàn tiền mặt hoặc khoản DEMO; các cổng thanh toán thật cần integration/refund webhook.
  for(const p of charged){await query('INSERT INTO payments(order_id,cash_shift_id,method,direction,amount,status) VALUES (?,?,?,?,?,?)',[o.id,o.cash_shift_id,p.method,'REFUND',p.amount,'SUCCESS'],conn);}
  if(o.stock_deducted&&!wasPrepared){const items=await query('SELECT * FROM order_items WHERE order_id=?',[o.id],conn);await changeStock(conn,o.branch_id,o.id,items,1,actor?.id,'RESTOCK');}
  if(o.promotion_id&&o.payment_status==='PAID'){
   await query('DELETE FROM promotion_uses WHERE order_id=?',[o.id],conn);
   await query('UPDATE promotions SET usage_count=GREATEST(0,usage_count-1) WHERE id=?',[o.promotion_id],conn);
  }
  if(o.customer_id&&o.payment_status==='PAID'){
   const pointsAdjustment=Number(o.points_redeemed)-Number(o.points_earned);
   const profile=(await query('SELECT points FROM customer_profiles WHERE user_id=? FOR UPDATE',[o.customer_id],conn))[0];
   const newPoints=Math.max(0,Number(profile?.points||0)+pointsAdjustment);
   const newTier=newPoints>=1000?'GOLD':newPoints>=300?'SILVER':'BRONZE';
   await query('UPDATE customer_profiles SET points=?,tier=? WHERE user_id=?',[newPoints,newTier,o.customer_id],conn);
   await query('INSERT INTO loyalty_ledger(customer_id,order_id,points_delta,reason) VALUES (?,?,?,?)',[o.customer_id,o.id,pointsAdjustment,'Hoàn điểm do hủy đơn'],conn);
  }
  await query("UPDATE orders SET status='CANCELLED',payment_status=CASE WHEN payment_status='UNPAID' THEN 'UNPAID' ELSE 'REFUNDED' END,cancel_reason=? WHERE id=?",[reason,o.id],conn);
  await audit(conn,actor?.id||null,o.branch_id,wasPrepared?'ORDER_CANCEL_WASTE':'ORDER_CANCEL_REFUND','order',o.id,{reason});
  return {id:o.id,status:'CANCELLED',refund:charged.reduce((s,p)=>s+Number(p.amount),0),waste:wasPrepared};
 });
}
module.exports={createOrder,payOrder,cancelOrder,changeStock};
