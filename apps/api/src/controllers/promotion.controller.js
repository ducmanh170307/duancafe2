const {query,transaction}=require('../config/db');
const {wrap,ensure,number,ok,fail}=require('../utils/http');
const {audit}=require('../services/audit.service');
const {findPromotion}=require('../services/promotion.service');
exports.list=wrap(async(req,res)=>{
 const promos=await query('SELECT p.*,u.name AS creator_name FROM promotions p JOIN users u ON u.id=p.created_by ORDER BY p.id DESC');
 const scopes=await query('SELECT * FROM promotion_branches');
 const prodScopes=await query('SELECT * FROM promotion_products');
 ok(res,promos.map(p=>({...p,branch_ids:scopes.filter(s=>s.promotion_id===p.id).map(s=>s.branch_id),product_ids:prodScopes.filter(s=>s.promotion_id===p.id).map(s=>s.product_id)})));
});
exports.create=wrap(async(req,res)=>{
 const body=req.body;ensure(String(body.name||'').trim().length>=3,'Tên chương trình chưa hợp lệ');
 ensure(['PERCENT','AMOUNT','BOGO','COMBO','FREE_SHIPPING','POINTS_MULTIPLIER'].includes(body.type),'Loại ưu đãi không hợp lệ');
 ensure(!Number.isNaN(Date.parse(body.starts_at))&&!Number.isNaN(Date.parse(body.ends_at))&&new Date(body.ends_at)>new Date(body.starts_at),'Ngày bắt đầu phải trước ngày kết thúc');
 const value=number(body.value??0,'Giá trị ưu đãi',{min:0});
 if(body.type==='PERCENT')ensure(value<=100,'Giảm phần trăm không được vượt 100');
 const branchIds=(body.branch_ids||[]).map(x=>number(x,'Chi nhánh',{min:1,integer:true}));
 const productIds=(body.product_ids||[]).map(x=>number(x,'Sản phẩm',{min:1,integer:true}));
 const id=await transaction(async conn=>{
  const p=await query(`INSERT INTO promotions (name,code,type,value,min_subtotal,starts_at,ends_at,allowed_channel,tier_required,max_uses,max_per_customer,auto_apply,stacking,status,created_by)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?)`,[body.name,String(body.code||'').trim().toUpperCase()||null,body.type,value,number(body.min_subtotal??0,'Mức đơn tối thiểu'),body.starts_at,body.ends_at,body.allowed_channel||'ALL',body.tier_required||'ANY',body.max_uses||null,body.max_per_customer||null,body.auto_apply?1:0,0,req.user.id],conn);
  for(const bid of [...new Set(branchIds)])await query('INSERT INTO promotion_branches VALUES (?,?)',[p.insertId,bid],conn);
  for(const pid of [...new Set(productIds)])await query('INSERT INTO promotion_products VALUES (?,?)',[p.insertId,pid],conn);
  await audit(conn,req.user.id,null,'PROMOTION_CREATE','promotion',p.insertId,{name:body.name});return p.insertId;
 });ok(res,{id},201);
});
exports.status=wrap(async(req,res)=>{
 const status=req.body.status;ensure(['DRAFT','SCHEDULED','ACTIVE','PAUSED','ENDED'].includes(status),'Trạng thái không hợp lệ');
 const result=await transaction(async conn=>{
  const p=(await query('SELECT * FROM promotions WHERE id=? FOR UPDATE',[req.params.id],conn))[0];if(!p)fail(404,'Không tìm thấy khuyến mãi');
  if(status==='ACTIVE'){
   ensure(new Date(p.ends_at.replace(' ','T')+'+07:00')>new Date(),'Chương trình đã quá hạn');
   if(p.auto_apply){
    const overlapping=await query(`SELECT id FROM promotions WHERE id<>? AND auto_apply=1 AND status='ACTIVE' AND starts_at<? AND ends_at>? AND (allowed_channel='ALL' OR ?='ALL' OR allowed_channel=?) LIMIT 1`,[p.id,p.ends_at,p.starts_at,p.allowed_channel,p.allowed_channel],conn);
    ensure(!overlapping.length,'Đã có ưu đãi tự động trùng thời gian/kênh; tránh xung đột bằng cách tắt một chương trình');
   }
  }
  await query('UPDATE promotions SET status=? WHERE id=?',[status,p.id],conn);
  await audit(conn,req.user.id,null,'PROMOTION_STATUS','promotion',p.id,{status});return {id:p.id,status};
 });ok(res,result);
});
exports.preview=wrap(async(req,res)=>{
 const {branch_id,channel,code,customer_id,subtotal,delivery_fee,items}=req.body;
 const best=await findPromotion({branchId:branch_id,channel:channel||'WEB',code,customerId:customer_id||null,subtotal:Number(subtotal||0),deliveryFee:Number(delivery_fee||0),items:Array.isArray(items)?items:[]});
 // Chỉ dùng để xem trước UI; đơn hàng thực tế tự tính giá từ MySQL, không tin subtotal từ client.
 ok(res,best?{id:best.promo.id,name:best.promo.name,discount:best.discount}:{discount:0});
});
