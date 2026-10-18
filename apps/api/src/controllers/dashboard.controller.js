const {query}=require('../config/db');
const {wrap,ok}=require('../utils/http');
const {branchAccess}=require('../middleware/auth');
exports.index=wrap(async(req,res)=>{
 const branchId=Number(req.query.branch_id||req.user.branch_id||1);
 branchAccess(req,branchId);
 const [summary]=await query(`SELECT COUNT(*) AS total_orders,
 COALESCE(SUM(CASE WHEN payment_status='PAID' THEN total ELSE 0 END),0) AS revenue,
 SUM(status IN ('CONFIRMED','PREPARING')) AS preparing,
 SUM(status='COMPLETED') AS completed
 FROM orders WHERE branch_id=? AND DATE(created_at)=CURDATE()`,[branchId]);
 const daily=await query(`SELECT DATE_FORMAT(created_at,'%d/%m') AS date,COUNT(*) AS orders,ROUND(SUM(CASE WHEN payment_status='PAID' THEN total ELSE 0 END)) AS revenue
 FROM orders WHERE branch_id=? AND created_at>=DATE_SUB(CURDATE(),INTERVAL 6 DAY)
 GROUP BY DATE(created_at) ORDER BY DATE(created_at)`,[branchId]);
 const popular=await query(`SELECT oi.product_name AS name,SUM(oi.quantity) AS sold FROM order_items oi JOIN orders o ON o.id=oi.order_id
 WHERE o.branch_id=? AND o.status<>'CANCELLED' AND o.created_at>=DATE_SUB(NOW(),INTERVAL 30 DAY)
 GROUP BY oi.product_name ORDER BY sold DESC LIMIT 5`,[branchId]);
 const lowStock=await query('SELECT i.name,b.quantity,i.min_quantity,i.unit FROM branch_inventory b JOIN ingredients i ON i.id=b.ingredient_id WHERE b.branch_id=? AND b.quantity<=i.min_quantity ORDER BY b.quantity LIMIT 8',[branchId]);
 const recent=await query('SELECT id,order_code,source,status,total,created_at FROM orders WHERE branch_id=? ORDER BY id DESC LIMIT 8',[branchId]);
 ok(res,{summary,daily,popular,lowStock,recent});
});
