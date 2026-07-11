<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

$host = "localhost";
$username = "root";
$password = "";
$dbname = "dtb_belajar";

$conn = new mysqli($host, $username, $password);
if ($conn->connect_error) {
    die("Koneksi ke MySQL Server gagal: " . $conn->connect_error);
}

$conn->query("CREATE DATABASE IF NOT EXISTS $dbname");
$conn->select_db($dbname);

$conn->query("CREATE TABLE IF NOT EXISTS tb_semester (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama_semester VARCHAR(50) NOT NULL UNIQUE
)");

$conn->query("CREATE TABLE IF NOT EXISTS tb_matakuliah (
    kode_mk VARCHAR(15) PRIMARY KEY,
    nama_mk VARCHAR(100) NOT NULL,
    sks INT NOT NULL
)");

$conn->query("CREATE TABLE IF NOT EXISTS tb_mahasiswa (
    nim VARCHAR(20) PRIMARY KEY,
    nama VARCHAR(150) NOT NULL,
    tempat_lahir VARCHAR(100) NOT NULL,
    tanggal_lahir DATE NOT NULL,
    ipk DECIMAL(3,2) NOT NULL
)");

$conn->query("CREATE TABLE IF NOT EXISTS tb_krs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nim VARCHAR(20),
    kode_mk VARCHAR(15),
    id_semester INT,
    FOREIGN KEY (nim) REFERENCES tb_mahasiswa(nim) ON DELETE CASCADE,
    FOREIGN KEY (kode_mk) REFERENCES tb_matakuliah(kode_mk) ON DELETE CASCADE,
    FOREIGN KEY (id_semester) REFERENCES tb_semester(id) ON DELETE CASCADE
)");

$checkSemester = $conn->query("SELECT COUNT(*) as count FROM tb_semester")->fetch_assoc();
if ($checkSemester['count'] == 0) {
    $conn->query("INSERT INTO tb_semester (nama_semester) VALUES 
        ('Gasal 2020-2021'),
        ('Genap 2020-2021'),
        ('Gasal 2021-2022')");

    $conn->query("INSERT INTO tb_matakuliah (kode_mk, nama_mk, sks) VALUES
        ('IF101', 'Pemrograman Web', 3),
        ('IF102', 'Basis Data', 3),
        ('IF103', 'Struktur Data', 3),
        ('IF104', 'Kecerdasan Buatan', 3)");

    $conn->query("INSERT INTO tb_mahasiswa (nim, nama, tempat_lahir, tanggal_lahir, ipk) VALUES
        ('13012012', 'James Situmorang', 'Medan', '1995-04-02', 2.70),
        ('14005011', 'Riana Putria', 'Padang', '1996-11-23', 3.10),
        ('15002032', 'Rina Kamila Sari', 'Jakarta', '1997-06-28', 3.40),
        ('15021044', 'Rudi Permana', 'Bandung', '1998-08-22', 2.90),
        ('15003036', 'Sari Citra Lestari', 'Jakarta', '1997-12-31', 3.50)");

    $conn->query("INSERT INTO tb_krs (nim, kode_mk, id_semester) VALUES
        ('13012012', 'IF101', 1),
        ('13012012', 'IF102', 1),
        ('14005011', 'IF101', 1),
        ('15002032', 'IF103', 1),
        ('15021044', 'IF104', 2),
        ('15003036', 'IF102', 1)");
}

$conn->query("CREATE OR REPLACE VIEW view_mahasiswa_gasal_2020_2021 AS
SELECT 
    m.nim AS NIM,
    m.nama AS Nama_Mahasiswa,
    mk.kode_mk AS Kode_MK,
    mk.nama_mk AS Nama_Mata_Kuliah,
    mk.sks AS SKS,
    s.nama_semester AS Semester
FROM tb_krs k
JOIN tb_mahasiswa m ON k.nim = m.nim
JOIN tb_matakuliah mk ON k.kode_mk = mk.kode_mk
JOIN tb_semester s ON k.id_semester = s.id
WHERE s.nama_semester = 'Gasal 2020-2021'");

$error_message = "";
$success_message = "";

if (isset($_GET['delete'])) {
    $nim = $_GET['delete'];
    $kode_mk = $_GET['kode_mk'];
    $stmt = $conn->prepare("DELETE FROM tb_krs WHERE nim=? AND kode_mk=? AND id_semester=1");
    $stmt->bind_param("ss", $nim, $kode_mk);
    if ($stmt->execute()) {
        header("Location: DaftarMahasiswa_DB.php?status=deleted");
        exit;
    } else {
        $error_message = "Gagal menghapus data pengambilan matakuliah.";
    }
    $stmt->close();
}

if (isset($_POST['action']) && $_POST['action'] == 'tambah') {
    $nim = $_POST['nim'];
    $kode_mk = $_POST['kode_mk'];

    $checkKrs = $conn->prepare("SELECT id FROM tb_krs WHERE nim=? AND kode_mk=? AND id_semester=1");
    $checkKrs->bind_param("ss", $nim, $kode_mk);
    $checkKrs->execute();
    $checkKrs->store_result();

    if ($checkKrs->num_rows > 0) {
        $error_message = "Mahasiswa sudah mengambil mata kuliah ini di semester Gasal 2020-2021!";
    } else {
        $stmt = $conn->prepare("INSERT INTO tb_krs (nim, kode_mk, id_semester) VALUES (?, ?, 1)");
        $stmt->bind_param("ss", $nim, $kode_mk);
        if ($stmt->execute()) {
            header("Location: DaftarMahasiswa_DB.php?status=added");
            exit;
        } else {
            $error_message = "Gagal menambahkan pengambilan matakuliah.";
        }
        $stmt->close();
    }
    $checkKrs->close();
}

if (isset($_GET['status'])) {
    if ($_GET['status'] == 'added') $success_message = "Mata kuliah berhasil ditambahkan ke KRS mahasiswa!";
    if ($_GET['status'] == 'deleted') $success_message = "Pengambilan mata kuliah berhasil dihapus dari KRS mahasiswa!";
}

$search = isset($_GET['search']) ? trim($_GET['search']) : '';
$queryStr = "SELECT * FROM view_mahasiswa_gasal_2020_2021";

if ($search != '') {
    $queryStr .= " WHERE NIM LIKE ? OR Nama_Mahasiswa LIKE ? OR Kode_MK LIKE ? OR Nama_Mata_Kuliah LIKE ?";
    $stmt = $conn->prepare($queryStr);
    $likeSearch = "%$search%";
    $stmt->bind_param("ssss", $likeSearch, $likeSearch, $likeSearch, $likeSearch);
} else {
    $stmt = $conn->prepare($queryStr);
}

$stmt->execute();
$result = $stmt->get_result();

$mahasiswas = [];
$mRes = $conn->query("SELECT nim, nama FROM tb_mahasiswa");
while ($m = $mRes->fetch_assoc()) {
    $mahasiswas[] = $m;
}

$matakuliahs = [];
$mkRes = $conn->query("SELECT kode_mk, nama_mk, sks FROM tb_matakuliah");
while ($mk = $mkRes->fetch_assoc()) {
    $matakuliahs[] = $mk;
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sistem Informasi Akademik - View Mahasiswa Gasal 2020-2021</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #4f46e5;
            --primary-hover: #4338ca;
            --success: #10b981;
            --danger: #ef4444;
            --warning: #f59e0b;
            --background: #f8fafc;
            --surface: #ffffff;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --border: #e2e8f0;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Plus Jakarta Sans', sans-serif;
        }

        body {
            background-color: var(--background);
            color: var(--text-main);
            padding: 40px 20px;
            min-height: 100vh;
            background-image: 
                radial-gradient(at 0% 0%, rgba(79, 70, 229, 0.05) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.05) 0px, transparent 50%);
        }

        .container {
            max-width: 1100px;
            margin: 0 auto;
        }

        header {
            margin-bottom: 30px;
            text-align: center;
        }

        header h1 {
            font-size: 2.2rem;
            font-weight: 700;
            color: var(--text-main);
            letter-spacing: -0.025em;
            margin-bottom: 8px;
        }

        header p {
            color: var(--text-muted);
            font-size: 1.05rem;
        }

        .alert {
            padding: 14px 20px;
            border-radius: 12px;
            margin-bottom: 25px;
            font-weight: 500;
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            animation: slideIn 0.3s ease-out;
        }

        .alert-success {
            background-color: #ecfdf5;
            border: 1px solid #a7f3d0;
            color: #065f46;
        }

        .alert-error {
            background-color: #fef2f2;
            border: 1px solid #fecaca;
            color: #991b1b;
        }

        @keyframes slideIn {
            from {
                transform: translateY(-10px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        .controls-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 25px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .search-form {
            display: flex;
            gap: 10px;
            flex: 1;
            max-width: 500px;
        }

        .input-control {
            width: 100%;
            padding: 10px 16px;
            border-radius: 10px;
            border: 1px solid var(--border);
            outline: none;
            font-size: 0.95rem;
            font-weight: 500;
            transition: all 0.2s ease;
            background-color: #f8fafc;
        }

        .input-control:focus {
            border-color: var(--primary);
            background-color: #ffffff;
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
        }

        .btn {
            padding: 10px 20px;
            font-weight: 600;
            font-size: 0.95rem;
            border-radius: 10px;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .btn-primary {
            background-color: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background-color: var(--primary-hover);
        }

        .btn-outline {
            background-color: transparent;
            border: 1px solid var(--border);
            color: var(--text-main);
        }

        .btn-outline:hover {
            background-color: #f1f5f9;
        }

        .table-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
            margin-bottom: 40px;
        }

        .table-container {
            width: 100%;
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        th {
            background-color: #f8fafc;
            padding: 16px 20px;
            font-weight: 600;
            font-size: 0.85rem;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 0.05em;
            border-bottom: 1px solid var(--border);
        }

        td {
            padding: 16px 20px;
            font-size: 0.95rem;
            color: var(--text-main);
            border-bottom: 1px solid var(--border);
            font-weight: 500;
        }

        tr:last-child td {
            border-bottom: none;
        }

        tr:hover td {
            background-color: #fafafa;
        }

        .action-btns {
            display: flex;
            gap: 8px;
        }

        .action-btn {
            padding: 6px 12px;
            font-size: 0.85rem;
            font-weight: 600;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s ease;
        }

        .btn-delete {
            background-color: var(--danger);
            color: white;
        }

        .btn-delete:hover {
            background-color: #dc2626;
        }

        .empty-row {
            text-align: center;
            color: var(--text-muted);
            padding: 40px !important;
        }

        .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(15, 23, 42, 0.4);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 0;
            pointer-events: none;
            transition: all 0.3s ease;
        }

        .modal.active {
            opacity: 1;
            pointer-events: auto;
        }

        .modal-card {
            background-color: var(--surface);
            border: 1px solid var(--border);
            border-radius: 20px;
            width: 100%;
            max-width: 550px;
            padding: 30px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            transform: scale(0.95);
            transition: transform 0.3s ease;
        }

        .modal.active .modal-card {
            transform: scale(1);
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
        }

        .modal-header h2 {
            font-size: 1.4rem;
            font-weight: 700;
        }

        .modal-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            color: var(--text-muted);
            cursor: pointer;
        }

        .form-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
            margin-bottom: 25px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        label {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-muted);
        }

        .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }
    </style>
</head>
<body>

    <div class="container">
        
        <header>
            <h1>Sistem Informasi Akademik</h1>
            <p>Database View: Mahasiswa Mengambil MK Semester Gasal 2020-2021</p>
        </header>

        <?php if ($success_message != ''): ?>
            <div class="alert alert-success">
                ✅ <?= $success_message ?>
            </div>
        <?php endif; ?>
        <?php if ($error_message != ''): ?>
            <div class="alert alert-error">
                ⚠️ <?= $error_message ?>
            </div>
        <?php endif; ?>

        <div class="controls-card">
            <form action="DaftarMahasiswa_DB.php" method="GET" class="search-form">
                <input type="text" name="search" placeholder="Cari di View berdasarkan NIM, Nama, Mata Kuliah..." value="<?= htmlspecialchars($search) ?>" class="input-control">
                <button type="submit" class="btn btn-outline">Cari</button>
                <?php if ($search != ''): ?>
                    <a href="DaftarMahasiswa_DB.php" class="btn btn-outline" style="text-decoration: none;">Reset</a>
                <?php endif; ?>
            </form>

            <button class="btn btn-primary" onclick="openTambahModal()">
                ➕ Tambah KRS (Gasal 2020-2021)
            </button>
        </div>

        <div class="table-card">
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>NIM</th>
                            <th>Nama Mahasiswa</th>
                            <th>Kode MK</th>
                            <th>Nama Mata Kuliah</th>
                            <th>SKS</th>
                            <th>Semester</th>
                            <th style="width: 150px; text-align: center;">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if ($result->num_rows > 0): ?>
                            <?php while ($row = $result->fetch_assoc()): ?>
                                <tr>
                                    <td><strong><?= htmlspecialchars($row['NIM']) ?></strong></td>
                                    <td><?= htmlspecialchars($row['Nama_Mahasiswa']) ?></td>
                                    <td><?= htmlspecialchars($row['Kode_MK']) ?></td>
                                    <td><?= htmlspecialchars($row['Nama_Mata_Kuliah']) ?></td>
                                    <td><?= htmlspecialchars($row['SKS']) ?> SKS</td>
                                    <td><?= htmlspecialchars($row['Semester']) ?></td>
                                    <td>
                                        <div class="action-btns" style="justify-content: center;">
                                            <a href="DaftarMahasiswa_DB.php?delete=<?= $row['NIM'] ?>&kode_mk=<?= $row['Kode_MK'] ?>" class="action-btn btn-delete" onclick="return confirm('Hapus pengambilan matakuliah ini dari KRS mahasiswa?')">Hapus</a>
                                        </div>
                                    </td>
                                </tr>
                            <?php endwhile; ?>
                        <?php else: ?>
                            <tr>
                                <td colspan="7" class="empty-row">Tidak ada data pengambilan matakuliah pada View.</td>
                            </tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>

    </div>

    <div class="modal" id="modalTambah">
        <div class="modal-card">
            <div class="modal-header">
                <h2>Tambah KRS (Semester Gasal 2020-2021)</h2>
                <button class="modal-close" onclick="closeTambahModal()">&times;</button>
            </div>
            <form action="DaftarMahasiswa_DB.php" method="POST">
                <input type="hidden" name="action" value="tambah">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="nim_t">Pilih Mahasiswa</label>
                        <select id="nim_t" name="nim" required class="input-control">
                            <option value="">-- Pilih Mahasiswa --</option>
                            <?php foreach ($mahasiswas as $m): ?>
                                <option value="<?= $m['nim'] ?>"><?= $m['nim'] ?> - <?= $m['nama'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="kode_mk_t">Pilih Mata Kuliah</label>
                        <select id="kode_mk_t" name="kode_mk" required class="input-control">
                            <option value="">-- Pilih Mata Kuliah --</option>
                            <?php foreach ($matakuliahs as $mk): ?>
                                <option value="<?= $mk['kode_mk'] ?>"><?= $mk['kode_mk'] ?> - <?= $mk['nama_mk'] ?> (<?= $mk['sks'] ?> SKS)</option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" onclick="closeTambahModal()">Batal</button>
                    <button type="submit" class="btn btn-primary">Simpan</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        function openTambahModal() {
            document.getElementById('modalTambah').classList.add('active');
        }
        function closeTambahModal() {
            document.getElementById('modalTambah').classList.remove('active');
        }

        window.onclick = function(event) {
            let modalTambah = document.getElementById('modalTambah');
            if (event.target == modalTambah) {
                closeTambahModal();
            }
        }
    </script>
</body>
</html>
<?php
$stmt->close();
$conn->close();
?>
