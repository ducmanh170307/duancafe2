const {query,transaction}=require('../config/db');
const menuModel=require('../models/menu.model');
const {audit}=require('../services/audit.service');
const {wrap,ok,ensure,number,fail}=require('../utils/http');
const {branchAccess}=require('../middleware/auth');
exports.list=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||1,'Chi nhánh',{min:1,integer:true});
 ok(res,await menuModel.menu(branchId,{manage:false}));
});
exports.manage=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||req.user.branch_id||1,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const data=await menuModel.menu(branchId,{manage:true});
 const ids=data.products.flatMap(p=>p.variants.map(v=>v.id));
 const recipes=ids.length?await query('SELECT r.variant_id,r.ingredient_id,r.quantity FROM recipes r WHERE r.variant_id IN (?)',[ids]):[];
 data.products.forEach(p=>p.variants.forEach(v=>{v.recipe=recipes.filter(r=>Number(r.variant_id)===Number(v.id));}));
 ok(res,data);
});
exports.categories=wrap(async(req,res)=>ok(res,await menuModel.categories()));
exports.createCategory=wrap(async(req,res)=>{
 const name=String(req.body.name||'').trim();ensure(name.length>=2,'Nhập tên danh mục');
 const result=await query('INSERT INTO categories(name,sort_order) VALUES (?,?)',[name,Number(req.body.sort_order)||0]);ok(res,{id:result.insertId},201);
});
function validateProduct(body){
 const name=String(body.name||'').trim();ensure(name.length>=2&&name.length<=150,'Tên sản phẩm từ 2–150 ký tự');
 const categoryId=number(body.category_id,'Danh mục',{min:1,integer:true});
 const variants=body.variants;ensure(Array.isArray(variants)&&variants.length>0,'Cần ít nhất một size');
 const sizes=new Set();
 for(const v of variants){
  ensure(v.size&&String(v.size).length<=20,'Size không hợp lệ');ensure(!sizes.has(v.size),'Trùng size');sizes.add(v.size);
  number(v.price,'Giá bán',{min:1});ensure(Array.isArray(v.recipe)&&v.recipe.length>0,'Mỗi size cần tối thiểu một nguyên liệu');
  for(const r of v.recipe){number(r.ingredient_id,'Nguyên liệu',{min:1,integer:true});number(r.quantity,'Định mức nguyên liệu',{min:0.001});}
 }
 return {name,categoryId,variants};
}
exports.create=wrap(async(req,res)=>{
 const data=validateProduct(req.body);
 const result=await transaction(async(conn)=>{
  const p=await query('INSERT INTO products(category_id,name,description,image_url,emoji,status) VALUES (?,?,?,?,?,?)',[data.categoryId,data.name,req.body.description||'',req.body.image_url||null,req.body.emoji||'☕','ACTIVE'],conn);
  for(const v of data.variants){
   const variant=await query('INSERT INTO product_variants(product_id,size,price) VALUES (?,?,?)',[p.insertId,v.size,number(v.price,'Giá',{min:1})],conn);
   for(const r of v.recipe)await query('INSERT INTO recipes(variant_id,ingredient_id,quantity) VALUES (?,?,?)',[variant.insertId,r.ingredient_id,r.quantity],conn);
  }
  await audit(conn,req.user.id,req.user.branch_id,'PRODUCT_CREATE','product',p.insertId,{name:data.name});
  return p.insertId;
 });ok(res,{id:result},201);
});
exports.update=wrap(async(req,res)=>{
 const data=validateProduct(req.body);const id=number(req.params.id,'Mã sản phẩm',{min:1,integer:true});
 await transaction(async(conn)=>{
  const existing=(await query('SELECT * FROM products WHERE id=? FOR UPDATE',[id],conn))[0];if(!existing)fail(404,'Không tìm thấy sản phẩm');
  await query('UPDATE products SET category_id=?,name=?,description=?,image_url=?,emoji=? WHERE id=?',[data.categoryId,data.name,req.body.description||'',req.body.image_url||null,req.body.emoji||'☕',id],conn);
  const old=await query('SELECT id,size FROM product_variants WHERE product_id=?',[id],conn);
  for(const v of data.variants){
   const found=old.find(o=>o.size===v.size);let variantId;
   if(found){variantId=found.id;await query('UPDATE product_variants SET price=?,active=1 WHERE id=?',[v.price,variantId],conn);await query('DELETE FROM recipes WHERE variant_id=?',[variantId],conn);}
   else{const inserted=await query('INSERT INTO product_variants(product_id,size,price) VALUES (?,?,?)',[id,v.size,v.price],conn);variantId=inserted.insertId;}
   for(const r of v.recipe)await query('INSERT INTO recipes(variant_id,ingredient_id,quantity) VALUES (?,?,?)',[variantId,r.ingredient_id,r.quantity],conn);
  }
  for(const o of old.filter(o=>!data.variants.some(v=>v.size===o.size)))await query('UPDATE product_variants SET active=0 WHERE id=?',[o.id],conn);
  await audit(conn,req.user.id,req.user.branch_id,'PRODUCT_UPDATE','product',id,{before:existing.name,after:data.name});
 });ok(res,{id});
});
exports.status=wrap(async(req,res)=>{
 const id=number(req.params.id,'Mã sản phẩm',{min:1,integer:true});const status=req.body.status;
 ensure(['ACTIVE','PAUSED','DELETED'].includes(status),'Trạng thái không hợp lệ');
 await transaction(async conn=>{
  const p=(await query('SELECT * FROM products WHERE id=? FOR UPDATE',[id],conn))[0];if(!p)fail(404,'Không tìm thấy món');
  if(status==='DELETED'){
   const sold=(await query('SELECT COUNT(*) AS total FROM order_items oi JOIN product_variants v ON v.id=oi.variant_id WHERE v.product_id=?',[id],conn))[0].total;
   // Xóa mềm để đảm bảo lịch sử và khóa ngoại kể cả khi chưa có đơn
   await query("UPDATE products SET status='DELETED' WHERE id=?",[id],conn);
   await audit(conn,req.user.id,req.user.branch_id,'PRODUCT_SOFT_DELETE','product',id,{had_sales:!!sold});
  } else {
   await query('UPDATE products SET status=? WHERE id=?',[status,id],conn);
   await audit(conn,req.user.id,req.user.branch_id,'PRODUCT_STATUS','product',id,{status});
  }
 });ok(res,{id,status});
});
exports.branchAvailability=wrap(async(req,res)=>{
 const branchId=number(req.body.branch_id||req.user.branch_id,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const productId=number(req.params.id,'Mã sản phẩm',{min:1,integer:true});
 await query('INSERT INTO branch_products(branch_id,product_id,available) VALUES (?,?,?) ON DUPLICATE KEY UPDATE available=VALUES(available)',[branchId,productId,req.body.available?1:0]);
 ok(res,{product_id:productId,available:!!req.body.available});
});

exports.branchPrice=wrap(async(req,res)=>{
 const branchId=number(req.body.branch_id||req.user.branch_id,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const variantId=number(req.body.variant_id,'Mã size',{min:1,integer:true});
 const price=number(req.body.price,'Giá chi nhánh',{min:1});
 const belongs=(await query('SELECT id FROM product_variants WHERE id=? AND product_id=?',[variantId,req.params.id]))[0];
 if(!belongs)fail(404,'Size không thuộc sản phẩm');
 await query('INSERT INTO branch_variant_prices(branch_id,variant_id,price) VALUES (?,?,?) ON DUPLICATE KEY UPDATE price=VALUES(price)',[branchId,variantId,price]);
 ok(res,{branch_id:branchId,variant_id:variantId,price});
});
