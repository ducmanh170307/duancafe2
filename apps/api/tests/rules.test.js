const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calcCashExpected,discountAmount,computeOrder,haversineMeters}=require('../src/utils/rules');
test('Đối soát tiền mặt chính xác với thu/hoàn/thu chi nội bộ',()=>{
 assert.equal(calcCashExpected({opening:300000,cashSales:450000,cashRefunds:50000,cashIn:100000,cashOut:25000}),775000);
});
test('Tính chiết khấu phần trăm và không âm',()=>{
 assert.equal(discountAmount({type:'PERCENT',value:10},100000,100000),10000);
 assert.equal(discountAmount({type:'AMOUNT',value:250000},100000,100000),100000);
});
test('Miễn phí vận chuyển & BOGO',()=>{
 assert.equal(discountAmount({type:'FREE_SHIPPING'},100000,100000,20000),20000);
 assert.equal(discountAmount({type:'BOGO'},120000,120000,0,[{unit_price:30000,quantity:3},{unit_price:50000,quantity:1}]),30000);
});
test('Tổng tiền có chiết khấu, VAT và phí vận chuyển',()=>{
 assert.deepEqual(computeOrder({subtotal:100000,discount:10000,deliveryFee:20000,taxRate:0.08}),{subtotal:100000,discount:10000,tax:7200,delivery_fee:20000,total:117200});
});
test('Miễn phí vận chuyển không làm giảm giá trị món',()=>{
 const result=computeOrder({subtotal:10000,discount:0,deliveryFee:20000,shippingDiscount:20000});
 assert.equal(result.total,10000);
 assert.equal(result.discount,20000);
});
test('Không chấp nhận khoản tiền âm',()=>{
 assert.throws(()=>computeOrder({subtotal:-5}),/không hợp lệ/i);
});
test('GPS xác định khoảng cách địa lý hợp lệ',()=>{
 assert.ok(haversineMeters(21.0236,105.8541,21.0236,105.8541)<1);
 assert.ok(haversineMeters(21.0236,105.8541,21.0369,105.7827)>250);
});
test('Đơn được giảm hết tiền món có tổng 0đ và không cần payment 0đ',()=>{
 const discount=discountAmount({type:'PERCENT',value:100},39000,39000);
 assert.equal(discount,39000);
 const total=computeOrder({subtotal:39000,discount});
 assert.equal(total.total,0);
});
test('Không giảm quá số tiền đủ điều kiện khi dùng mã tiền cố định',()=>{
 const discount=discountAmount({type:'AMOUNT',value:100000},50000,28000);
 assert.equal(discount,28000);
});
