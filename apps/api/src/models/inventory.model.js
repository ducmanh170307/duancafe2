const {query}=require('../config/db');
async function inventory(branchId){return query(`SELECT i.id,i.name,i.unit,i.min_quantity,COALESCE(b.quantity,0) AS quantity,COALESCE(b.avg_cost,0) AS avg_cost
 FROM ingredients i LEFT JOIN branch_inventory b ON b.ingredient_id=i.id AND b.branch_id=? ORDER BY i.name`,[branchId]);}
async function receipts(branchId){return query(`SELECT sr.*,s.name AS supplier_name,u.name AS creator_name FROM stock_receipts sr
 LEFT JOIN suppliers s ON s.id=sr.supplier_id JOIN users u ON u.id=sr.created_by
 WHERE sr.branch_id=? ORDER BY sr.id DESC LIMIT 60`,[branchId]);}
async function alerts(branchId){
 const low=await query(`SELECT i.name,i.unit,i.min_quantity,COALESCE(b.quantity,0) AS quantity FROM ingredients i
 LEFT JOIN branch_inventory b ON b.ingredient_id=i.id AND b.branch_id=? WHERE COALESCE(b.quantity,0)<=i.min_quantity ORDER BY i.name`,[branchId]);
 const expiring=await query('SELECT i.name,l.lot_code,l.expires_at,l.quantity_remaining FROM inventory_lots l JOIN ingredients i ON i.id=l.ingredient_id WHERE l.branch_id=? AND l.quantity_remaining>0 AND l.expires_at<=DATE_ADD(CURDATE(),INTERVAL 7 DAY) ORDER BY l.expires_at',[branchId]);
 return {low,expiring};
}
module.exports={inventory,receipts,alerts};
