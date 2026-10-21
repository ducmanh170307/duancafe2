const { sql, connectDB } = require('../config/db');

// ================= LUỒNG 0: QUẢN LÝ CHUỖI CHI NHÁNH (MULTI-BRANCH) =================
const getBranches = async (req, res) => {
    try {
        const pool = await connectDB();
        const branches = await pool.request().query(`
            SELECT cn.*, 
                   ISNULL((SELECT SUM(TongPhaiTra) FROM DonHang dh WHERE dh.MaChiNhanh = cn.MaChiNhanh AND dh.TrangThaiThanhToan = 'paid'), 0) AS DoanhThuChiNhanh,
                   (SELECT COUNT(*) FROM NhanVien nv WHERE nv.MaChiNhanh = cn.MaChiNhanh AND nv.TrangThai = 'active') AS SoNhanVien
            FROM ChiNhanh cn
            ORDER BY cn.MaChiNhanh ASC
        `);
        res.json({ success: true, branches: branches.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const manageBranch = async (req, res) => {
    const { action, MaChiNhanh, TenChiNhanh, DiaChi, SoDienThoai, TrangThai } = req.body;
    try {
        const pool = await connectDB();
        if (action === 'create') {
            await pool.request()
                .input('Ten', sql.NVarChar, TenChiNhanh)
                .input('DiaChi', sql.NVarChar, DiaChi)
                .input('SDT', sql.VarChar, SoDienThoai)
                .query(`
                    DECLARE @NewOut TABLE (ID INT);
                    INSERT INTO ChiNhanh (TenChiNhanh, DiaChi, SoDienThoai, TrangThai)
                    OUTPUT INSERTED.MaChiNhanh INTO @NewOut
                    VALUES (@Ten, @DiaChi, @SDT, 'open');
                    
                    DECLARE @NewBranchID INT = (SELECT ID FROM @NewOut);
                    -- Khởi tạo tồn kho mặc định cho chi nhánh mới
                    INSERT INTO TonKhoChiNhanh (MaChiNhanh, MaNguyenLieu, SoLuongTon, MucTonToiThieu)
                    SELECT @NewBranchID, MaNguyenLieu, 2000, 200 FROM NguyenLieu;
                `);
            return res.json({ success: true, message: '🏢 Đã khai trương Chi nhánh mới và khởi tạo kho thành công!' });
        } else if (action === 'status') {
            await pool.request()
                .input('MaCN', sql.Int, MaChiNhanh)
                .input('TrangThai', sql.VarChar, TrangThai)
                .query(`UPDATE ChiNhanh SET TrangThai = @TrangThai WHERE MaChiNhanh = @MaCN`);
            return res.json({ success: true, message: `✅ Đã cập nhật trạng thái chi nhánh sang [${TrangThai}]!` });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { getBranches, manageBranch };
