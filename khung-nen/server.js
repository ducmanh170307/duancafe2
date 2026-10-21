const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { connectDB } = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const branchController = require('./controllers/branchController');
const hrController = require('./controllers/hrController');
const shiftController = require('./controllers/shiftController');
const posController = require('./controllers/posController');
const kdsController = require('./controllers/kdsController');
const inventoryController = require('./controllers/inventoryController');
const promotionController = require('./controllers/promotionController');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

connectDB();

app.get('/', (req, res) => {
    res.send('☕ Hệ thống Quản trị Chuỗi Cà Phê ERP/POS Đa Chi Nhánh đang hoạt động!');
});

// Luồng 6: Quản lý Menu
app.use('/api/products', productRoutes);

// Luồng 0: Quản lý Chuỗi Chi Nhánh
app.get('/api/erp/branches', branchController.getBranches);
app.post('/api/erp/branches', branchController.manageBranch);

// Luồng 1 -> 8: ERP & POS
app.get('/api/erp/hr', hrController.getHRData);
app.post('/api/erp/hr', hrController.handleHRAction);

app.get('/api/erp/shift', shiftController.getShiftStatus);
app.post('/api/erp/shift/open', shiftController.openShift);
app.post('/api/erp/shift/cashflow', shiftController.createInternalCashFlow);
app.post('/api/erp/shift/close', shiftController.closeShift);

app.get('/api/erp/pos-init', posController.getPOSInitData);
app.post('/api/erp/orders', posController.createOrderPOS);

app.get('/api/erp/kds', kdsController.getKDSOrders);
app.post('/api/erp/kds/update', kdsController.updateKDSStatus);

app.post('/api/erp/inventory/import', inventoryController.importInventory);
app.post('/api/erp/promotions', promotionController.createPromotion);

app.listen(PORT, () => {
    console.log(`🚀 Server Chuỗi Cà Phê ERP đang chạy tại http://localhost:${PORT}`);
});