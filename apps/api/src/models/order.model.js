const {query}=require('../config/db');
async function listOrders(branchId,{status,source,limit=80}={}){
 let sql=`SELECT o.*,u.name AS customer_name,cs.id AS register_shift_id FROM orders o LEFT JOIN users u ON u.id=o.customer_id
 LEFT JOIN cash_shifts cs ON cs.id=o.cash_shift_id WHERE o.branch_id=?`;
 const params=[branchId];
 if(status){sql+=' AND o.status=?';params.push(status);}
 if(source){sql+=' AND o.source=?';params.push(source);}
 sql+=' ORDER BY o.id DESC LIMIT ?';params.push(limit);
 return query(sql,params);
}
async function detail(id,conn){
 const order=(await query('SELECT * FROM orders WHERE id=?',[id],conn))[0];if(!order)return null;
 const items=await query(`SELECT oi.*,c.name AS category_name FROM order_items oi JOIN product_variants v ON v.id=oi.variant_id
 JOIN products p ON p.id=v.product_id JOIN categories c ON c.id=p.category_id WHERE oi.order_id=?`,[id],conn);
 const payments=await query('SELECT * FROM payments WHERE order_id=? ORDER BY id',[id],conn);
 return {...order,items,payments};
}
module.exports={listOrders,detail};
