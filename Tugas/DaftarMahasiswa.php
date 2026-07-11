<?php
session_start();
error_reporting(E_ALL);
ini_set('display_errors', 1);

if (!isset($_SESSION['mahasiswa'])) {
    $_SESSION['mahasiswa'] = [
        ['nim' => '13012012', 'nama' => 'James Situmorang', 'tempat_lahir' => 'Medan', 'tanggal_lahir' => '1995-04-02', 'fakultas' => 'Kedokteran', 'jurusan' => 'Kedokteran Gigi', 'ipk' => 2.70],
        ['nim' => '14005011', 'nama' => 'Riana Putria', 'tempat_lahir' => 'Padang', 'tanggal_lahir' => '1996-11-23', 'fakultas' => 'FMIPA', 'jurusan' => 'Kimia', 'ipk' => 3.10],
        ['nim' => '15002032', 'nama' => 'Rina Kamila Sari', 'tempat_lahir' => 'Jakarta', 'tanggal_lahir' => '1997-06-28', 'fakultas' => 'Ekonomi', 'jurusan' => 'Akuntansi', 'ipk' => 3.40],
        ['nim' => '15021044', 'nama' => 'Rudi Permana', 'tempat_lahir' => 'Bandung', 'tanggal_lahir' => '1998-08-22', 'fakultas' => 'FASILKOM', 'jurusan' => 'Ilmu Komputer', 'ipk' => 2.90],
        ['nim' => '15003036', 'nama' => 'Sari Citra Lestari', 'tempat_lahir' => 'Jakarta', 'tanggal_lahir' => '1997-12-31', 'fakultas' => 'Ekonomi', 'jurusan' => 'Manajemen', 'ipk' => 3.50]
    ];
}

$error_message = "";
$success_message = "";

if (isset($_GET['delete'])) {
    $nim = $_GET['delete'];
    $found = false;
    foreach ($_SESSION['mahasiswa'] as $key => $m) {
        if ($m['nim'] == $nim) {
            unset($_SESSION['mahasiswa'][$key]);
            $_SESSION['mahasiswa'] = array_values($_SESSION['mahasiswa']);
            $found = true;
            break;
        }
    }
    if ($found) {
        header("Location: DaftarMahasiswa.php?status=deleted");
        exit;
    }
}

if (isset($_POST['action']) && $_POST['action'] == 'tambah') {
    $nim = $_POST['nim'];
    $nama = $_POST['nama'];
    $tempat_lahir = $_POST['tempat_lahir'];
    $tanggal_lahir = $_POST['tanggal_lahir'];
    $fakultas = $_POST['fakultas'];
    $jurusan = $_POST['jurusan'];
    $ipk = floatval($_POST['ipk']);

    $duplicate = false;
    foreach ($_SESSION['mahasiswa'] as $m) {
        if ($m['nim'] == $nim) {
            $duplicate = true;
            break;
        }
    }

    if ($duplicate) {
        $error_message = "Error: NIM sudah terdaftar!";
    } else {
        $_SESSION['mahasiswa'][] = [
            'nim' => $nim,
            'nama' => $nama,
            'tempat_lahir' => $tempat_lahir,
            'tanggal_lahir' => $tanggal_lahir,
            'fakultas' => $fakultas,
            'jurusan' => $jurusan,
            'ipk' => $ipk
        ];
        header("Location: DaftarMahasiswa.php?status=added");
        exit;
    }
}

if (isset($_POST['action']) && $_POST['action'] == 'edit') {
    $nim = $_POST['nim'];
    $nama = $_POST['nama'];
    $tempat_lahir = $_POST['tempat_lahir'];
    $tanggal_lahir = $_POST['tanggal_lahir'];
    $fakultas = $_POST['fakultas'];
    $jurusan = $_POST['jurusan'];
    $ipk = floatval($_POST['ipk']);

    $found = false;
    foreach ($_SESSION['mahasiswa'] as $key => $m) {
        if ($m['nim'] == $nim) {
            $_SESSION['mahasiswa'][$key] = [
                'nim' => $nim,
                'nama' => $nama,
                'tempat_lahir' => $tempat_lahir,
                'tanggal_lahir' => $tanggal_lahir,
                'fakultas' => $fakultas,
                'jurusan' => $jurusan,
                'ipk' => $ipk
            ];
            $found = true;
            break;
        }
    }

    if ($found) {
        header("Location: DaftarMahasiswa.php?status=updated");
        exit;
    }
}

if (isset($_GET['status'])) {
    if ($_GET['status'] == 'added') $success_message = "Data mahasiswa berhasil ditambahkan!";
    if ($_GET['status'] == 'updated') $success_message = "Data mahasiswa berhasil diperbarui!";
    if ($_GET['status'] == 'deleted') $success_message = "Data mahasiswa berhasil dihapus!";
}

$search = isset($_GET['search']) ? trim($_GET['search']) : '';
$data = $_SESSION['mahasiswa'];

if ($search != '') {
    $filtered = [];
    foreach ($data as $m) {
        if (strpos(strtolower($m['nim']), strtolower($search)) !== false ||
            strpos(strtolower($m['nama']), strtolower($search)) !== false ||
            strpos(strtolower($m['tempat_lahir']), strtolower($search)) !== false ||
            strpos(strtolower($m['fakultas']), strtolower($search)) !== false ||
            strpos(strtolower($m['jurusan']), strtolower($search)) !== false) {
            $filtered[] = $m;
        }
    }
    $data = $filtered;
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sistem Informasi Akademik - Daftar Mahasiswa</title>
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

        .ipk-badge {
            background-color: #e0f2fe;
            color: #0369a1;
            padding: 4px 8px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 0.85rem;
            display: inline-block;
        }

        .ipk-high {
            background-color: #d1fae5;
            color: #065f46;
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

        .btn-edit {
            background-color: #f59e0b;
            color: white;
        }

        .btn-edit:hover {
            background-color: #d97706;
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
            grid-template-columns: 1fr 1fr;
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
            <p>Daftar Mahasiswa Berdasarkan Array PHP</p>
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
            <form action="DaftarMahasiswa.php" method="GET" class="search-form">
                <input type="text" name="search" placeholder="Cari berdasarkan NIM, Nama, Tempat Lahir, Jurusan..." value="<?= htmlspecialchars($search) ?>" class="input-control">
                <button type="submit" class="btn btn-outline">Cari</button>
                <?php if ($search != ''): ?>
                    <a href="DaftarMahasiswa.php" class="btn btn-outline" style="text-decoration: none;">Reset</a>
                <?php endif; ?>
            </form>

            <button class="btn btn-primary" onclick="openTambahModal()">
                ➕ Tambah Mahasiswa
            </button>
        </div>

        <div class="table-card">
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>NIM</th>
                            <th>Nama</th>
                            <th>Tempat Lahir</th>
                            <th>Tanggal Lahir</th>
                            <th>Fakultas</th>
                            <th>Jurusan</th>
                            <th>IPK</th>
                            <th style="width: 150px; text-align: center;">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (count($data) > 0): ?>
                            <?php foreach ($data as $row): ?>
                                <tr>
                                    <td><strong><?= htmlspecialchars($row['nim']) ?></strong></td>
                                    <td><?= htmlspecialchars($row['nama']) ?></td>
                                    <td><?= htmlspecialchars($row['tempat_lahir']) ?></td>
                                    <td><?= date('d-m-Y', strtotime($row['tanggal_lahir'])) ?></td>
                                    <td><?= htmlspecialchars($row['fakultas']) ?></td>
                                    <td><?= htmlspecialchars($row['jurusan']) ?></td>
                                    <td>
                                        <span class="ipk-badge <?= ($row['ipk'] >= 3.0) ? 'ipk-high' : '' ?>">
                                            <?= number_format($row['ipk'], 2) ?>
                                        </span>
                                    </td>
                                    <td>
                                        <div class="action-btns">
                                            <button class="action-btn btn-edit" onclick="openEditModal({
                                                nim: '<?= $row['nim'] ?>',
                                                nama: '<?= addslashes($row['nama']) ?>',
                                                tempat_lahir: '<?= addslashes($row['tempat_lahir']) ?>',
                                                tanggal_lahir: '<?= $row['tanggal_lahir'] ?>',
                                                fakultas: '<?= addslashes($row['fakultas']) ?>',
                                                jurusan: '<?= addslashes($row['jurusan']) ?>',
                                                ipk: '<?= $row['ipk'] ?>'
                                            })">Edit</button>
                                            <a href="DaftarMahasiswa.php?delete=<?= $row['nim'] ?>" class="action-btn btn-delete" onclick="return confirm('Apakah Anda yakin ingin menghapus data <?= addslashes($row['nama']) ?>?')">Hapus</a>
                                        </div>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <tr>
                                <td colspan="8" class="empty-row">Tidak ada data mahasiswa ditemukan.</td>
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
                <h2>Tambah Mahasiswa Baru</h2>
                <button class="modal-close" onclick="closeTambahModal()">&times;</button>
            </div>
            <form action="DaftarMahasiswa.php" method="POST">
                <input type="hidden" name="action" value="tambah">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="nim_t">NIM</label>
                        <input type="text" id="nim_t" name="nim" required class="input-control" placeholder="Contoh: 15002032">
                    </div>
                    <div class="form-group">
                        <label for="nama_t">Nama Lengkap</label>
                        <input type="text" id="nama_t" name="nama" required class="input-control" placeholder="Contoh: Rina Sari">
                    </div>
                    <div class="form-group">
                        <label for="tempat_lahir_t">Tempat Lahir</label>
                        <input type="text" id="tempat_lahir_t" name="tempat_lahir" required class="input-control" placeholder="Contoh: Jakarta">
                    </div>
                    <div class="form-group">
                        <label for="tanggal_lahir_t">Tanggal Lahir</label>
                        <input type="date" id="tanggal_lahir_t" name="tanggal_lahir" required class="input-control">
                    </div>
                    <div class="form-group">
                        <label for="fakultas_t">Fakultas</label>
                        <input type="text" id="fakultas_t" name="fakultas" required class="input-control" placeholder="Contoh: Ekonomi">
                    </div>
                    <div class="form-group">
                        <label for="jurusan_t">Jurusan</label>
                        <input type="text" id="jurusan_t" name="jurusan" required class="input-control" placeholder="Contoh: Akuntansi">
                    </div>
                    <div class="form-group">
                        <label for="ipk_t">IPK</label>
                        <input type="number" id="ipk_t" name="ipk" step="0.01" min="0" max="4.00" required class="input-control" placeholder="Contoh: 3.50">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" onclick="closeTambahModal()">Batal</button>
                    <button type="submit" class="btn btn-primary">Simpan</button>
                </div>
            </form>
        </div>
    </div>

    <div class="modal" id="modalEdit">
        <div class="modal-card">
            <div class="modal-header">
                <h2>Ubah Data Mahasiswa</h2>
                <button class="modal-close" onclick="closeEditModal()">&times;</button>
            </div>
            <form action="DaftarMahasiswa.php" method="POST">
                <input type="hidden" name="action" value="edit">
                <input type="hidden" id="edit_nim_hidden" name="nim">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="edit_nim">NIM (Tidak dapat diubah)</label>
                        <input type="text" id="edit_nim" disabled class="input-control" style="background-color: #e2e8f0; cursor: not-allowed;">
                    </div>
                    <div class="form-group">
                        <label for="edit_nama">Nama Lengkap</label>
                        <input type="text" id="edit_nama" name="nama" required class="input-control">
                    </div>
                    <div class="form-group">
                        <label for="edit_tempat_lahir">Tempat Lahir</label>
                        <input type="text" id="edit_tempat_lahir" name="tempat_lahir" required class="input-control">
                    </div>
                    <div class="form-group">
                        <label for="edit_tanggal_lahir">Tanggal Lahir</label>
                        <input type="date" id="edit_tanggal_lahir" name="tanggal_lahir" required class="input-control">
                    </div>
                    <div class="form-group">
                        <label for="edit_fakultas">Fakultas</label>
                        <input type="text" id="edit_fakultas" name="fakultas" required class="input-control">
                    </div>
                    <div class="form-group">
                        <label for="edit_jurusan">Jurusan</label>
                        <input type="text" id="edit_jurusan" name="jurusan" required class="input-control">
                    </div>
                    <div class="form-group">
                        <label for="edit_ipk">IPK</label>
                        <input type="number" id="edit_ipk" name="ipk" step="0.01" min="0" max="4.00" required class="input-control">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" onclick="closeEditModal()">Batal</button>
                    <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
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

        function openEditModal(data) {
            document.getElementById('edit_nim').value = data.nim;
            document.getElementById('edit_nim_hidden').value = data.nim;
            document.getElementById('edit_nama').value = data.nama;
            document.getElementById('edit_tempat_lahir').value = data.tempat_lahir;
            document.getElementById('edit_tanggal_lahir').value = data.tanggal_lahir;
            document.getElementById('edit_fakultas').value = data.fakultas;
            document.getElementById('edit_jurusan').value = data.jurusan;
            document.getElementById('edit_ipk').value = data.ipk;
            document.getElementById('modalEdit').classList.add('active');
        }
        function closeEditModal() {
            document.getElementById('modalEdit').classList.remove('active');
        }

        window.onclick = function(event) {
            let modalTambah = document.getElementById('modalTambah');
            let modalEdit = document.getElementById('modalEdit');
            if (event.target == modalTambah) {
                closeTambahModal();
            }
            if (event.target == modalEdit) {
                closeEditModal();
            }
        }
    </script>
</body>
</html>
