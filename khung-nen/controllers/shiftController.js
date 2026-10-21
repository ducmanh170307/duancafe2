const { sql, connectDB } = require('../config/db');

// ================= LUỒNG 2 & LUỒNG 5: MỞ CA, THU CHI & ĐÓNG CA THEO CHI NHÁNH =================
const getShiftStatus = async (req, res) => {
    const maChiNhanh = parseInt(req.query.branchId) || 1;
    try {
        const pool = await connectDB();
        const activeShift = await pool.request()
            .input('MaCN', sql.Int, maChiNhanh)
            .query(`
                SELECT pc.*, nv.HoTen AS TenThuNgan, cn.TenChiNhanh
                FROM PhienCaPOS pc
                JOIN NhanVien nv ON pc.ThuNganMoCa = nv.MaNhanVien
                JOIN ChiNhanh cn ON pc.MaChiNhanh = cn.MaChiNhanh
                WHERE pc.TrangThai = 'open' AND pc.MaChiNhanh = @MaCN
            `);
        const historyShifts = await pool.request()
            .input('MaCN', sql.Int, maChiNhanh)
            .query(`
                SELECT TOP 6 pc.*, nv.HoTen AS TenThuNgan
                FROM PhienCaPOS pc
                JOIN NhanVien nv ON pc.ThuNganMoCa = nv.MaNhanVien
                WHERE pc.MaChiNhanh = @MaCN
                ORDER BY pc.MaPhienCa DESC
            `);
        res.json({ 
            success: true, 
            activeShift: activeShift.recordset[0] || null,
            historyShifts: historyShifts.recordset
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const openShift = async (req, res) => {
    const { MaChiNhanh, MaPIN, TienMatDauCa, LyDoLechDauCa } = req.body;
    const branchId = parseInt(MaChiNhanh) || 1;
    try {
        const pool = await connectDB();
        const checkOpen = await pool.request()
            .input('MaCN', sql.Int, branchId)
            .query(`SELECT * FROM PhienCaPOS WHERE TrangThai = 'open' AND MaChiNhanh = @MaCN`);
        if (checkOpen.recordset.length > 0) {
            return res.status(400).json({ success: false, message: '⚠️ Chi nhánh này đang có một phiên ca mở rồi!' });
        }

        const nv = await pool.request().input('MaPIN', sql.VarChar, MaPIN)
            .query(`SELECT MaNhanVien, HoTen FROM NhanVien WHERE MaPIN = @MaPIN AND TrangThai = 'active'`);
        if (nv.recordset.length === 0) return res.status(400).json({ success: false, message: '❌ Mã PIN nhân viên không hợp lệ!' });

        await pool.request()
            .input('MaCN', sql.Int, branchId)
            .input('ThuNgan', sql.Int, nv.recordset[0].MaNhanVien)
            .input('TienDauCa', sql.Decimal(14,2), TienMatDauCa)
            .input('LyDo', sql.NVarChar, LyDoLechDauCa || 'Khớp ca trước')
            .query(`
                INSERT INTO PhienCaPOS (MaMayPOS, MaChiNhanh, ThuNganMoCa, TienMatDauCa, LyDoLechDauCa, TrangThai)
                VALUES (1, @MaCN, @ThuNgan, @TienDauCa, @LyDo, 'open');
                UPDATE ChiNhanh SET TrangThai = 'open' WHERE MaChiNhanh = @MaCN;
            `);
        res.json({ success: true, message: `🎉 Mở ca thành công tại Chi nhánh #${branchId}! Thu ngân: ${nv.recordset[0].HoTen}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createInternalCashFlow = async (req, res) => {
    const { MaPhienCa, LoaiPhieu, SoTien, LyDo } = req.body;
    try {
        const pool = await connectDB();
        await pool.request()
            .input('MaPhienCa', sql.Int, MaPhienCa)
            .input('Loai', sql.VarChar, LoaiPhieu)
            .input('SoTien', sql.Decimal(14,2), SoTien)
            .input('LyDo', sql.NVarChar, LyDo)
            .query(`
                INSERT INTO PhieuThuChiNoiBo (MaPhienCa, LoaiPhieu, SoTien, LyDo, NguoiTao)
                VALUES (@MaPhienCa, @Loai, @SoTien, @LyDo, 3);
                IF @Loai = 'THU'
                    UPDATE PhienCaPOS SET TongThuNoiBo = TongThuNoiBo + @SoTien WHERE MaPhienCa = @MaPhienCa;
                ELSE
                    UPDATE PhienCaPOS SET TongChiNoiBo = TongChiNoiBo + @SoTien WHERE MaPhienCa = @MaPhienCa;
            `);
        res.json({ success: true, message: `✅ Đã ghi nhận phiếu ${LoaiPhieu} nội bộ thành công!` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const closeShift = async (req, res) => {
    const { MaPhienCa, TienMatThucTeCuoiCa, LyDoChenhLechCuoiCa } = req.body;
    try {
        const pool = await connectDB();
        const pendingOrders = await pool.request().input('MaPhienCa', sql.Int, MaPhienCa)
            .query(`SELECT COUNT(*) AS Total FROM DonHang WHERE MaPhienCa = @MaPhienCa AND TrangThaiDonHang IN ('Pending_Payment', 'Confirmed', 'Preparing')`);
        
        if (pendingOrders.recordset[0].Total > 0) {
            return res.status(400).json({ success: false, message: `⚠️ Còn ${pendingOrders.recordset[0].Total} đơn đang pha chế chưa hoàn tất! Hãy xử lý hết ở màn hình KDS trước khi đóng ca.` });
        }

        await pool.request()
            .input('MaPhienCa', sql.Int, MaPhienCa)
            .input('TienThucTe', sql.Decimal(14,2), TienMatThucTeCuoiCa)
            .input('LyDo', sql.NVarChar, LyDoChenhLechCuoiCa || 'Khớp két')
            .query(`
                UPDATE PhienCaPOS 
                SET ThoiGianDong = GETDATE(),
                    ThuNganDongCa = ThuNganMoCa,
                    TienMatThucTeCuoiCa = @TienThucTe,
                    TienChenhLech = @TienThucTe - (TienMatDauCa + TongThuTienMat - TongHoanTienMat + TongThuNoiBo - TongChiNoiBo),
                    LyDoChenhLechCuoiCa = @LyDo,
                    TrangThai = 'closed'
                WHERE MaPhienCa = @MaPhienCa
            `);
        res.json({ success: true, message: '🔒 Đã chốt ca và khóa sổ két thành công!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { getShiftStatus, openShift, createInternalCashFlow, closeShift };
