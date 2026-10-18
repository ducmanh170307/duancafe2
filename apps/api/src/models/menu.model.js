const {query}=require('../config/db');
async function menu(branchId,{manage=false}={}){
 const products=await query(`SELECT p.*,c.name AS category_name,COALESCE(bp.available,1) AS branch_available
 FROM products p JOIN categories c ON c.id=p.category_id
 LEFT JOIN branch_products bp ON bp.product_id=p.id AND bp.branch_id=?
 WHERE p.status<>'DELETED' ${manage?'':"AND p.status='ACTIVE' AND COALESCE(bp.available,1)=1"}
 ORDER BY c.sort_order,p.name`,[branchId]);
 const variants=await query(`SELECT v.id,v.product_id,v.size,v.active,COALESCE(vp.price,v.price) AS price,
 (SELECT COUNT(*) FROM recipes r LEFT JOIN branch_inventory bi ON bi.ingredient_id=r.ingredient_id AND bi.branch_id=? WHERE r.variant_id=v.id AND (COALESCE(bi.quantity,0)-COALESCE((SELECT SUM(l.quantity_remaining) FROM inventory_lots l WHERE l.branch_id=? AND l.ingredient_id=r.ingredient_id AND l.expires_at<CURDATE()),0))<r.quantity) AS lacking
 FROM product_variants v LEFT JOIN branch_variant_prices vp ON vp.variant_id=v.id AND vp.branch_id=?`,[branchId,branchId,branchId]);
 const toppings=await query('SELECT * FROM toppings WHERE active=1 ORDER BY id');
 const byProduct=new Map();
 variants.forEach(v=>{const group=byProduct.get(v.product_id)||[];group.push({...v,available:!!v.active&&Number(v.lacking)===0});byProduct.set(v.product_id,group);});
 return {products:products.map(p=>({...p,variants:byProduct.get(p.id)||[]})),toppings};
}
async function categories(){return query('SELECT * FROM categories ORDER BY sort_order,name');}
async function recipes(variantId,conn){return query('SELECT r.ingredient_id,r.quantity,i.name,i.unit FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.variant_id=?',[variantId],conn);}
module.exports={menu,categories,recipes};
