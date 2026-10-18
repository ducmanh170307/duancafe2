require('../config/env');
const bcrypt=require('bcryptjs');
const {pool,query,transaction}=require('../config/db');
const {assertEnv}=require('../config/env');
const {createOrder,payOrder}=require('../services/order.service');
const {sqlNow,vnDate}=require('../utils/dates');
async function seed(){
 assertEnv();
 const branches=[['HN01','BeanFlow Hoàn Kiếm','26 Hàng Bài, Hoàn Kiếm, Hà Nội',21.0236,105.8541,'OPEN'],['HN02','BeanFlow Cầu Giấy','102 Xuân Thủy, Cầu Giấy, Hà Nội',21.0369,105.7827,'CLOSED']];
 for(const b of branches)await query('INSERT IGNORE INTO branches(code,name,address,latitude,longitude,status) VALUES (?,?,?,?,?,?)',b);
 const ids=Object.fromEntries((await query('SELECT id,code FROM branches')).map(b=>[b.code,b.id]));
 for(const [code,branchId] of Object.entries(ids))await query('INSERT IGNORE INTO registers(branch_id,code,name) VALUES (?,?,?)',[branchId,'POS01','Quầy thu ngân 01']);
 const pw=await bcrypt.hash('Demo@12345',12);
 const users=[['Quản trị hệ thống','admin@beanflow.vn','ADMIN',null],['Nguyễn Minh Anh','manager@beanflow.vn','BRANCH_MANAGER',ids.HN01],['Trần Thu Hà','cashier@beanflow.vn','CASHIER',ids.HN01],['Lê Hoàng Long','barista@beanflow.vn','BARISTA',ids.HN01],['Nguyễn Ngọc Mai','customer@beanflow.vn','CUSTOMER',null]];
 for(const u of users)await query('INSERT IGNORE INTO users(name,email,role,branch_id,password_hash) VALUES (?,?,?,?,?)',[...u.slice(0,4),pw]);
 const userRows=await query('SELECT * FROM users WHERE email LIKE ?',['%@beanflow.vn']);
 const U=Object.fromEntries(userRows.map(u=>[u.role,u]));
 await query('UPDATE users SET phone=? WHERE id=? AND (phone IS NULL OR phone=?)',['0912345678',U.CUSTOMER.id,'']);
 await query('INSERT IGNORE INTO customer_profiles(user_id,points,tier) VALUES (?,?,?)',[U.CUSTOMER.id,450,'SILVER']);
 const categories=['Cà phê','Trà trái cây','Đá xay','Bánh ngọt'];
 for(let i=0;i<categories.length;i++)await query('INSERT IGNORE INTO categories(name,sort_order) VALUES (?,?)',[categories[i],i]);
 const c=Object.fromEntries((await query('SELECT * FROM categories')).map(x=>[x.name,x.id]));
 const ingredients=[['Cà phê rang xay','g',500],['Sữa tươi','ml',3000],['Sữa đặc','ml',1000],['Trà đen','g',300],['Đào ngâm','g',600],['Trân châu','g',400],['Đá viên','g',3000],['Đường nước','ml',1000],['Bột matcha','g',300],['Kem cheese','g',500],['Bánh croissant','cái',10],['Bánh tiramisu','cái',10],['Bột cacao','g',300],['Syrup vani','ml',400]];
 for(const ing of ingredients)await query('INSERT IGNORE INTO ingredients(name,unit,min_quantity) VALUES (?,?,?)',ing);
 const I=Object.fromEntries((await query('SELECT * FROM ingredients')).map(i=>[i.name,i.id]));
 for(const branchId of Object.values(ids))for(const ing of ingredients){
  const quantity=branchId===ids.HN01?(ing[1]==='cái'?70:20000):(ing[1]==='cái'?25:7000);
  await query('INSERT IGNORE INTO branch_inventory(branch_id,ingredient_id,quantity,avg_cost) VALUES (?,?,?,?)',[branchId,I[ing[0]],quantity,ing[1]==='cái'?15000:200]);
 }
 const products=[
  {name:'Cà phê sữa đá',category:'Cà phê',emoji:'🧋',description:'Cà phê pha phin đậm đà, sữa đặc thơm béo',variants:[['M',32000,[['Cà phê rang xay',25],['Sữa đặc',45],['Đá viên',120]]],['L',39000,[['Cà phê rang xay',35],['Sữa đặc',60],['Đá viên',170]]]]},
  {name:'Bạc xỉu',category:'Cà phê',emoji:'🥛',description:'Êm dịu, ngậy sữa, một chút cà phê',variants:[['M',35000,[['Cà phê rang xay',12],['Sữa tươi',160],['Sữa đặc',30],['Đá viên',110]]],['L',42000,[['Cà phê rang xay',16],['Sữa tươi',210],['Sữa đặc',40],['Đá viên',160]]]]},
  {name:'Espresso',category:'Cà phê',emoji:'☕',description:'Shot espresso chuẩn vị với crema mịn',variants:[['Single',29000,[['Cà phê rang xay',20]]],['Double',39000,[['Cà phê rang xay',35]]]]},
  {name:'Trà đào cam sả',category:'Trà trái cây',emoji:'🍑',description:'Trà đen thơm mát kết hợp đào ngọt dịu',variants:[['M',42000,[['Trà đen',15],['Đào ngâm',80],['Đường nước',20],['Đá viên',150]]],['L',49000,[['Trà đen',22],['Đào ngâm',100],['Đường nước',30],['Đá viên',200]]]]},
  {name:'Trà sữa trân châu',category:'Trà trái cây',emoji:'🧋',description:'Trà sữa nhà làm với vị trà thanh',variants:[['M',39000,[['Trà đen',14],['Sữa tươi',150],['Đường nước',25],['Đá viên',100]]],['L',46000,[['Trà đen',20],['Sữa tươi',200],['Đường nước',35],['Đá viên',150]]]]},
  {name:'Matcha đá xay',category:'Đá xay',emoji:'🍵',description:'Bột matcha mịn, sữa tươi và đá xay',variants:[['M',49000,[['Bột matcha',12],['Sữa tươi',180],['Đường nước',20],['Đá viên',180]]],['L',59000,[['Bột matcha',16],['Sữa tươi',240],['Đường nước',25],['Đá viên',230]]]]},
  {name:'Chocolate đá xay',category:'Đá xay',emoji:'🍫',description:'Chocolate hảo hạng, kem sữa mềm mịn',variants:[['M',49000,[['Bột cacao',20],['Sữa tươi',180],['Đường nước',25],['Đá viên',180]]]]},
  {name:'Croissant bơ',category:'Bánh ngọt',emoji:'🥐',description:'Bánh sừng bò giòn rụm, thơm bơ',variants:[['1 cái',32000,[['Bánh croissant',1]]]]},
  {name:'Tiramisu',category:'Bánh ngọt',emoji:'🍰',description:'Bánh mousse cà phê mềm mịn',variants:[['1 phần',49000,[['Bánh tiramisu',1]]]]}
 ];
 for(const p of products){
  await query("INSERT IGNORE INTO products(category_id,name,description,emoji) VALUES (?,?,?,?)",[c[p.category],p.name,p.description,p.emoji]);
  const product=(await query('SELECT id FROM products WHERE name=?',[p.name]))[0];
  for(const v of p.variants){
   await query('INSERT IGNORE INTO product_variants(product_id,size,price) VALUES (?,?,?)',[product.id,v[0],v[1]]);
   const variant=(await query('SELECT id FROM product_variants WHERE product_id=? AND size=?',[product.id,v[0]]))[0];
   for(const [name,qty] of v[2])await query('INSERT IGNORE INTO recipes(variant_id,ingredient_id,quantity) VALUES (?,?,?)',[variant.id,I[name],qty]);
  }
 }
 const toppings=[['Trân châu',7000,'Trân châu',35],['Kem cheese',9000,'Kem cheese',35],['Extra shot',12000,'Cà phê rang xay',18]];
 for(const [name,price,ing,qty] of toppings){
  await query('INSERT IGNORE INTO toppings(name,price) VALUES (?,?)',[name,price]);
  const t=(await query('SELECT id FROM toppings WHERE name=?',[name]))[0];
  await query('INSERT IGNORE INTO topping_recipes VALUES (?,?,?)',[t.id,I[ing],qty]);
 }
 await query('INSERT IGNORE INTO suppliers(name,phone) VALUES (?,?)',['Nhà cung cấp nguyên liệu Hà Nội','0988000000']);
 const start=new Date(Date.now()-86400000),end=new Date(Date.now()+45*86400000);
 if(!(await query('SELECT id FROM promotions WHERE name=?',['Chào ngày mới - Giảm 10%'])).length) await query(`INSERT INTO promotions(name,code,type,value,min_subtotal,starts_at,ends_at,allowed_channel,auto_apply,status,created_by)
 VALUES (?,?,?,?,?,?,?,'ALL',1,'ACTIVE',?)`,['Chào ngày mới - Giảm 10%',null,'PERCENT',10,50000,sqlNow(start),sqlNow(end),U.ADMIN.id]);
 await query(`INSERT IGNORE INTO promotions(name,code,type,value,min_subtotal,starts_at,ends_at,allowed_channel,auto_apply,status,created_by)
 VALUES (?,?,?,?,?,?,?,'WEB',0,'ACTIVE',?)`,['Ưu đãi đặt online 20K','ONLINE20','AMOUNT',20000,80000,sqlNow(start),sqlNow(end),U.ADMIN.id]);
 const date=vnDate();
 const begins=date+' 06:00:00',ends=date+' 23:59:00';
 const shiftName='Ca sáng demo '+date;
 let work=(await query('SELECT id FROM work_shifts WHERE name=? AND branch_id=?',[shiftName,ids.HN01]))[0];
 if(!work){const result=await query('INSERT INTO work_shifts(branch_id,name,job_role,starts_at,ends_at,required_staff,created_by) VALUES (?,?,?,?,?,?,?)',[ids.HN01,shiftName,'CASHIER',begins,ends,1,U.BRANCH_MANAGER.id]);work={id:result.insertId};}
 await query('INSERT IGNORE INTO shift_assignments(shift_id,user_id) VALUES (?,?)',[work.id,U.CASHIER.id]);
 const assignment=(await query('SELECT id FROM shift_assignments WHERE shift_id=? AND user_id=?',[work.id,U.CASHIER.id]))[0];
 await query("INSERT IGNORE INTO attendance(assignment_id,check_in,method) VALUES (?,?,'MANUAL')",[assignment.id,begins]);
 const register=(await query('SELECT id FROM registers WHERE branch_id=? LIMIT 1',[ids.HN01]))[0];
 let cs=(await query("SELECT id FROM cash_shifts WHERE register_id=? AND status='OPEN' ORDER BY id DESC LIMIT 1",[register.id]))[0];
 if(!cs){
  const result=await query('INSERT INTO cash_shifts(branch_id,register_id,cashier_id,opening_cash) VALUES (?,?,?,?)',[ids.HN01,register.id,U.CASHIER.id,300000]);cs={id:result.insertId};
 }
 const currentOrders=(await query('SELECT COUNT(*) AS n FROM orders WHERE branch_id=?',[ids.HN01]))[0].n;
 if(currentOrders===0){
  const variants=await query('SELECT pv.id,p.name FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE pv.size=?',['M']);
  const byName=Object.fromEntries(variants.map(v=>[v.name,v.id]));
  for(const [i,items] of [[1,[{variant_id:byName['Cà phê sữa đá'],quantity:2},{variant_id:byName['Trà đào cam sả'],quantity:1}]],
   [2,[{variant_id:byName['Bạc xỉu'],quantity:1},{variant_id:byName['Matcha đá xay'],quantity:1}]],
   [3,[{variant_id:byName['Trà sữa trân châu'],quantity:2}]]]){
   const order=await createOrder({body:{branch_id:ids.HN01,cash_shift_id:cs.id,order_type:'TAKEAWAY',items,guest_name:'Khách tại quầy'},actor:U.CASHIER,source:'POS'});
   await payOrder({orderId:order.id,method:'CASH',actor:U.CASHIER});
   if(i===1)await query("UPDATE orders SET status='COMPLETED' WHERE id=?",[order.id]);
   if(i===2)await query("UPDATE orders SET status='PREPARING' WHERE id=?",[order.id]);
  }
 }
 console.log('Seed hoàn tất. Tài khoản demo: admin@beanflow.vn / Demo@12345');
 await pool.end();
}
seed().catch(async err=>{console.error('Seed lỗi:',err);await pool.end();process.exit(1);});
