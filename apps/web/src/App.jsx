import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom';
import {AuthProvider,useAuth} from './contexts/AuthContext';
import {ToastProvider} from './contexts/ToastContext';
import {Layout} from './components/Layout';
import {Loading} from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Online from './pages/Online';
import Orders from './pages/Orders';
import KDS from './pages/KDS';
import Register from './pages/Register';
import Workforce from './pages/Workforce';
import Attendance from './pages/Attendance';
import Menu from './pages/Menu';
import Inventory from './pages/Inventory';
import Promotions from './pages/Promotions';
import Reports from './pages/Reports';
import Admin from './pages/Admin';
const manager=['ADMIN','BRANCH_MANAGER'];
const seller=[...manager,'CASHIER'];
const kds=[...manager,'BARISTA'];
function Protected({roles,children}){
 const {user,ready}=useAuth();
 if(!ready)return <Loading/>;
 if(!user)return <Navigate to="/dang-nhap" replace/>;
 if(roles&&!roles.includes(user.role))return <Navigate to={user.role==='BARISTA'?'/pha-che':user.role==='CUSTOMER'?'/dat-hang':'/tong-quan'} replace/>;
 return <Layout>{children}</Layout>;
}
function Root(){const {user,ready}=useAuth();if(!ready)return <Loading/>;return <Navigate to={!user?'/dang-nhap':user.role==='BARISTA'?'/pha-che':user.role==='CUSTOMER'?'/dat-hang':'/tong-quan'} replace/>;}
export default function App(){return <BrowserRouter><AuthProvider><ToastProvider><Routes>
 <Route path="/" element={<Root/>}/><Route path="/dang-nhap" element={<Login/>}/><Route path="/dat-hang" element={<Online/>}/>
 <Route path="/tong-quan" element={<Protected roles={seller}><Dashboard/></Protected>}/>
 <Route path="/lich-lam" element={<Protected roles={manager}><Workforce/></Protected>}/>
 <Route path="/cham-cong" element={<Protected roles={[...kds,'CASHIER']}><Attendance/></Protected>}/>
 <Route path="/ca-thu-ngan" element={<Protected roles={seller}><Register/></Protected>}/>
 <Route path="/ban-hang" element={<Protected roles={seller}><POS/></Protected>}/>
 <Route path="/don-hang" element={<Protected roles={[...kds,'CASHIER']}><Orders/></Protected>}/>
 <Route path="/pha-che" element={<Protected roles={kds}><KDS/></Protected>}/>
 <Route path="/thuc-don" element={<Protected roles={manager}><Menu/></Protected>}/>
 <Route path="/kho" element={<Protected roles={manager}><Inventory/></Protected>}/>
 <Route path="/khuyen-mai" element={<Protected roles={manager}><Promotions/></Protected>}/>
 <Route path="/bao-cao" element={<Protected roles={manager}><Reports/></Protected>}/>
 <Route path="/quan-tri" element={<Protected roles={manager}><Admin/></Protected>}/>
 <Route path="*" element={<Root/>}/>
 </Routes></ToastProvider></AuthProvider></BrowserRouter>}
