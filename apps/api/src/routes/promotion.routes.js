const r=require('express').Router();
const c=require('../controllers/promotion.controller');
const {authenticate,allow,ROLES}=require('../middleware/auth');
r.get('/promotions',authenticate,allow(ROLES.ADMIN,ROLES.MANAGER,ROLES.CASHIER),c.list);
r.post('/promotions',authenticate,allow(ROLES.ADMIN),c.create);
r.patch('/promotions/:id/status',authenticate,allow(ROLES.ADMIN),c.status);
// Preview yêu cầu xác thực vì phí và ưu đãi cần đối chiếu customer_id trên server khi thanh toán.
module.exports=r;
