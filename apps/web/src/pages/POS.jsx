import {useState} from 'react';
import {ReceiptText,WalletCards,CircleCheck,Store,Info,ChefHat} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {useNotify} from '../contexts/ToastContext';
import {useData} from '../components/data';
import {MenuChooser,Cart,useCart} from '../components/Shop';
import {PageHeader,Loading,Select,Input,Button,Badge,Modal} from '../components/ui';
import {money} from '../utils/format';
import {api} from '../api/client';
export default function POS(){
 const {branchId}=useAuth(),notify=useNotify();
 const menu=useData(`/menu?branch_id=${branchId}`),shifts=useData(`/register/shifts?branch_id=${branchId}`),cart=useCart();
 const [shiftId,setShiftId]=useState(''),[orderType,setOrderType]=useState('TAKEAWAY'),[guestName,setGuestName]=useState(''),[guestPhone,setGuestPhone]=useState(''),[promo,setPromo]=useState(''),[payment,setPayment]=useState('CASH'),[amount,setAmount]=useState(''),[deliveryAddress,setDeliveryAddress]=useState(''),[customer,setCustomer]=useState(null),[busy,setBusy]=useState(false),[done,setDone]=useState(null);
 const active=(shifts.data?.active||[]).filter(x=>x.status==='OPEN');
 const chosenShift=shiftId||active[0]?.id;
 const lookupCustomer=async()=>{try{const result=await api('/customers/lookup?phone='+encodeURIComponent(guestPhone));setCustomer(result);notify(result?'Đã gắn khách hàng thành viên':'Khách chưa có tài khoản');}catch(e){notify(e.message,'error');}};
 const checkout=async()=>{
  if(!chosenShift)return notify('Bạn cần mở ca thu ngân trước khi bán hàng','error');
  if(orderType==='DELIVERY'&&deliveryAddress.trim().length<12)return notify('Nhập địa chỉ giao hàng đầy đủ','error');
  setBusy(true);
  try{
   const order=await api('/orders',{method:'POST',body:{branch_id:branchId,cash_shift_id:Number(chosenShift),order_type:orderType,items:cart.payload,guest_name:guestName,guest_phone:guestPhone,customer_id:customer?.id||null,promo_code:promo||undefined,delivery_address:deliveryAddress||undefined}});
   if(order.status==='CONFIRMED'){
    setDone(order);cart.clear();setGuestName('');setGuestPhone('');setPromo('');setAmount('');setCustomer(null);
    notify('Đơn 0đ đã được xác nhận và chuyển pha chế.');return;
   }
   let payResult;
   try {payResult=await api(`/orders/${order.id}/pay`,{method:'POST',body:{method:payment,...(amount?{amount:Number(amount)}:{})}});}
   catch(e){notify('Đã tạo đơn #'+order.order_code+' nhưng chưa ghi nhận thanh toán: '+e.message,'error');setDone({...order,status:'PENDING_PAYMENT',payment_error:e.message});cart.clear();return;}
   setDone({...order,status:payResult.status,payResult});cart.clear();setGuestName('');setGuestPhone('');setPromo('');setAmount('');setCustomer(null);
   notify(payResult.due===0?'Đã thanh toán! Đơn chuyển đến pha chế.':'Đã thu một phần; cần thu đủ trước khi pha chế.');
  }catch(e){notify(e.message,'error');}finally{setBusy(false);}
 };
 return <><PageHeader eyebrow="Vận hành / POS" title="Bán hàng tại quầy" description="Chọn món · tùy chỉnh · áp khuyến mãi · thu tiền · chuyển pha chế" action={<Badge tone={active.length?'success':'danger'}><Store size={12}/>{active.length?'Có ca đang mở':'Chưa mở ca'}</Badge>}/>
 <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_370px] gap-6 items-start"><div><div className="bg-white border border-[#ebe5dc] rounded-[18px] p-4 mb-5 grid grid-cols-2 gap-3"><Select label="QUẦY THU NGÂN" value={chosenShift||''} onChange={e=>setShiftId(e.target.value)}><option value="">{active.length?'Chọn ca mở':'Chưa có ca mở'}</option>{active.map(s=><option value={s.id} key={s.id}>Ca #{s.id} · {s.register_name}</option>)}</Select><Select label="LOẠI ĐƠN" value={orderType} onChange={e=>setOrderType(e.target.value)}><option value="TAKEAWAY">Mang đi</option><option value="DINE_IN">Dùng tại quán</option><option value="DELIVERY">Giao hàng</option></Select></div>{menu.loading?<Loading/>:<MenuChooser data={menu.data} onAdd={cart.add}/>}</div><div className="xl:sticky xl:top-[95px] space-y-4"><Cart {...cart} busy={busy} checkout={checkout} checkoutLabel={payment==='CASH'?'Xác nhận thu tiền mặt':'Thanh toán mô phỏng'} footer={<div className="space-y-3 border-b border-stone-100 pb-4"><div className="grid grid-cols-2 gap-2"><Input label="TÊN KHÁCH" value={guestName} onChange={e=>setGuestName(e.target.value)} placeholder="Khách lẻ"/><Input label="SỐ ĐIỆN THOẠI" value={guestPhone} onChange={e=>{setGuestPhone(e.target.value);setCustomer(null);}} placeholder="09..."/></div><div className="flex items-center justify-between gap-2"><button onClick={lookupCustomer} disabled={!guestPhone.trim()} className="text-[11px] font-bold text-[#9a7049] disabled:opacity-50">Tra cứu thành viên →</button>{customer&&<Badge tone="success">{customer.name} · {customer.points} điểm</Badge>}</div>{orderType==='DELIVERY'&&<Input label="ĐỊA CHỈ GIAO HÀNG" value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} placeholder="Số nhà, đường, quận..."/>}<Input label="MÃ ƯU ĐÃI (NẾU CÓ)" value={promo} onChange={e=>setPromo(e.target.value.toUpperCase())} placeholder="Ví dụ ONLINE20"/><div className="grid grid-cols-2 gap-2"><Select label="PHƯƠNG THỨC THU" value={payment} onChange={e=>setPayment(e.target.value)}><option value="CASH">Tiền mặt</option><option value="DEMO">Mô phỏng thanh toán</option></Select><Input type="number" min="1" label="THU TỪNG PHẦN (ĐỂ TRỐNG = ĐỦ)" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Toàn bộ"/></div><p className="text-[10px] text-stone-400">Thanh toán thẻ / QR / ví thực tế cần cổng thanh toán. Demo không ghi nhận giao dịch ngân hàng.</p></div>}/><div className="p-4 bg-[#efe7dc] rounded-2xl flex gap-3 items-start"><Info size={18} className="text-[#886747] shrink-0 mt-0.5"/><p className="text-xs text-[#77624d] leading-5">Chỉ những đơn <strong>đã thanh toán đủ</strong> mới được chuyển vào màn hình pha chế KDS.</p></div></div></div>
 {done&&<Modal title="Kết quả tạo đơn" onClose={()=>setDone(null)} footer={<Button onClick={()=>setDone(null)}>Tiếp tục bán hàng</Button>}><div className="text-center py-4"><div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 mx-auto mb-5"><CircleCheck size={38}/></div><p className="text-sm text-stone-500">Mã đơn hàng</p><div className="text-2xl font-extrabold text-[#2c2019] break-all mt-2">{done.order_code}</div><p className="text-3xl font-extrabold mt-5 text-[#8e6846]">{money(done.total)}</p><Badge tone={done.status==='CONFIRMED'?'success':'warning'}>{done.status==='CONFIRMED'?'Đã thanh toán · Đã chuyển pha chế':'Chờ thu đủ tiền'}</Badge><p className="text-xs text-stone-400 mt-5">Phiếu bán hàng nội bộ. Không thay thế hóa đơn điện tử VAT.</p></div></Modal>}
 </>;
}
