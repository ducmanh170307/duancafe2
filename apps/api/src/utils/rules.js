const {ensure}=require('./http');
function calcCashExpected({opening=0,cashSales=0,cashRefunds=0,cashIn=0,cashOut=0}) {
 return Math.round((Number(opening)+Number(cashSales)-Number(cashRefunds)+Number(cashIn)-Number(cashOut))*100)/100;
}
function discountAmount(promo,subtotal,eligibleSubtotal,deliveryFee=0,quantities=[]) {
 if(!promo)return 0;
 const eligible=Math.max(0,Number(eligibleSubtotal));
 switch(promo.type){
  case 'PERCENT': return Math.min(eligible,Math.round(eligible*Number(promo.value)/100));
  case 'AMOUNT': return Math.min(eligible,Number(promo.value));
  case 'FREE_SHIPPING': return Math.max(0,Number(deliveryFee));
  case 'BOGO': {
    // Một sản phẩm thuộc phạm vi chương trình: mua 1 tặng 1 cùng biến thể
    return quantities.reduce((sum,item)=>sum+Math.floor(item.quantity/2)*item.unit_price,0);
  }
  case 'COMBO': return Math.min(eligible,Number(promo.value));
  case 'POINTS_MULTIPLIER': return 0;
  default:return 0;
 }
}
function computeOrder({subtotal,discount=0,deliveryFee=0,shippingDiscount=0,taxRate=0}) {
 for(const n of [subtotal,discount,deliveryFee,shippingDiscount,taxRate]) ensure(Number.isFinite(Number(n))&&Number(n)>=0,'Số tiền không hợp lệ');
 const base=Math.max(0,Number(subtotal)-Number(discount));
 const tax=Math.round(base*Number(taxRate));
 const shippingDue=Math.max(0,Number(deliveryFee)-Number(shippingDiscount));
 return {subtotal:Number(subtotal),discount:Number(discount)+Number(shippingDiscount),tax,delivery_fee:Number(deliveryFee),total:Math.round(base+tax+shippingDue)};
}
function haversineMeters(lat1,lon1,lat2,lon2){
 const rad=Math.PI/180,R=6371000,dLat=(lat2-lat1)*rad,dLon=(lon2-lon1)*rad;
 const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
 return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
module.exports={calcCashExpected,discountAmount,computeOrder,haversineMeters};
