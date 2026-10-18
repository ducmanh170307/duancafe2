const {query}=require('../config/db');
const {discountAmount}=require('../utils/rules');
const {sqlNow}=require('../utils/dates');
const {fail}=require('../utils/http');
async function findPromotion({code,branchId,channel,customerId,subtotal,deliveryFee,items},conn){
 const sql=`SELECT p.* FROM promotions p WHERE p.status='ACTIVE' AND NOW() BETWEEN p.starts_at AND p.ends_at
 AND (p.allowed_channel='ALL' OR p.allowed_channel=?) AND (? IS NULL OR p.code=?) AND (p.auto_apply=1 OR p.code IS NOT NULL AND p.code=?)
 AND NOT EXISTS (SELECT 1 FROM promotion_branches pb WHERE pb.promotion_id=p.id AND pb.branch_id<>? AND
 NOT EXISTS (SELECT 1 FROM promotion_branches pb2 WHERE pb2.promotion_id=p.id AND pb2.branch_id=?))
 ORDER BY p.auto_apply DESC,p.id DESC LIMIT 50`;
 // branch scopes are verified again in code below for readability
 const candidates=await query(sql,[channel,code||null,code||null,code||null,branchId,branchId],conn);
 let best=null;
 for(const promo of candidates){
  if(Number(subtotal)<Number(promo.min_subtotal))continue;
  if(promo.max_uses!==null&&Number(promo.usage_count)>=Number(promo.max_uses))continue;
  const branchScopes=await query('SELECT branch_id FROM promotion_branches WHERE promotion_id=?',[promo.id],conn);
  if(branchScopes.length&&!branchScopes.some(x=>Number(x.branch_id)===Number(branchId)))continue;
  const productScopes=await query('SELECT product_id FROM promotion_products WHERE promotion_id=?',[promo.id],conn);
  const eligibleItems=productScopes.length?items.filter(x=>productScopes.some(p=>Number(p.product_id)===Number(x.product_id))):items;
  if(!eligibleItems.length)continue;
  if(promo.tier_required!=='ANY'){
   if(!customerId)continue;
   const profile=(await query('SELECT tier FROM customer_profiles WHERE user_id=?',[customerId],conn))[0];
   const tiers=['BRONZE','SILVER','GOLD'];if(!profile||tiers.indexOf(profile.tier)<tiers.indexOf(promo.tier_required))continue;
  }
  if(promo.max_per_customer!==null){
   if(!customerId)continue;
   const n=(await query('SELECT COUNT(*) AS n FROM promotion_uses WHERE promotion_id=? AND customer_id=?',[promo.id,customerId],conn))[0].n;
   if(n>=promo.max_per_customer)continue;
  }
  const eligibleSubtotal=eligibleItems.reduce((a,x)=>a+x.line_total,0);
  const discount=discountAmount(promo,subtotal,eligibleSubtotal,deliveryFee,eligibleItems);
  if(promo.type!=='POINTS_MULTIPLIER'&&discount<=0)continue;
  if(!best||discount>best.discount)best={promo,discount};
 }
 if(code&&!best)fail(400,'Mã ưu đãi không hợp lệ hoặc không đủ điều kiện');
 return best;
}
async function redeemPromotion(conn,promotionId,orderId,customerId){
 if(!promotionId)return;
 const [p]=await query('SELECT * FROM promotions WHERE id=? FOR UPDATE',[promotionId],conn);
 if(!p||p.status!=='ACTIVE'||p.starts_at>sqlNow()||p.ends_at<sqlNow()||p.max_uses!==null&&p.usage_count>=p.max_uses)fail(409,'Chương trình ưu đãi đã hết lượt hoặc không còn hiệu lực');
 if(customerId&&p.max_per_customer!==null){
  const n=(await query('SELECT COUNT(*) AS n FROM promotion_uses WHERE promotion_id=? AND customer_id=?',[promotionId,customerId],conn))[0].n;
  if(n>=p.max_per_customer)fail(409,'Khách hàng đã dùng hết lượt ưu đãi');
 }
 await query('INSERT INTO promotion_uses (promotion_id,order_id,customer_id) VALUES (?,?,?)',[promotionId,orderId,customerId||null],conn);
 await query('UPDATE promotions SET usage_count=usage_count+1 WHERE id=?',[promotionId],conn);
}
module.exports={findPromotion,redeemPromotion};
