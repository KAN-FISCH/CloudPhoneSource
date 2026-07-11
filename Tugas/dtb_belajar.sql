CREATE DATABASE IF NOT EXISTS dtb_belajar;
USE dtb_belajar;

CREATE TABLE IF NOT EXISTS tb_semester (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama_semester VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tb_matakuliah (
    kode_mk VARCHAR(15) PRIMARY KEY,
    nama_mk VARCHAR(100) NOT NULL,
    sks INT NOT NULL
);

CREATE TABLE IF NOT EXISTS tb_mahasiswa (
    nim VARCHAR(20) PRIMARY KEY,
    nama VARCHAR(150) NOT NULL,
    tempat_lahir VARCHAR(100) NOT NULL,
    tanggal_lahir DATE NOT NULL,
    ipk DECIMAL(3,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS tb_krs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nim VARCHAR(20),
    kode_mk VARCHAR(15),
    id_semester INT,
    FOREIGN KEY (nim) REFERENCES tb_mahasiswa(nim) ON DELETE CASCADE,
    FOREIGN KEY (kode_mk) REFERENCES tb_matakuliah(kode_mk) ON DELETE CASCADE,
    FOREIGN KEY (id_semester) REFERENCES tb_semester(id) ON DELETE CASCADE
);

INSERT INTO tb_semester (nama_semester) VALUES 
('Gasal 2020-2021'),
('Genap 2020-2021'),
('Gasal 2021-2022');

INSERT INTO tb_matakuliah (kode_mk, nama_mk, sks) VALUES
('IF101', 'Pemrograman Web', 3),
('IF102', 'Basis Data', 3),
('IF103', 'Struktur Data', 3),
('IF104', 'Kecerdasan Buatan', 3);

INSERT INTO tb_mahasiswa (nim, nama, tempat_lahir, tanggal_lahir, ipk) VALUES
('13012012', 'James Situmorang', 'Medan', '1995-04-02', 2.70),
('14005011', 'Riana Putria', 'Padang', '1996-11-23', 3.10),
('15002032', 'Rina Kamila Sari', 'Jakarta', '1997-06-28', 3.40),
('15021044', 'Rudi Permana', 'Bandung', '1998-08-22', 2.90),
('15003036', 'Sari Citra Lestari', 'Jakarta', '1997-12-31', 3.50);

INSERT INTO tb_krs (nim, kode_mk, id_semester) VALUES
('13012012', 'IF101', 1),
('13012012', 'IF102', 1),
('14005011', 'IF101', 1),
('15002032', 'IF103', 1),
('15021044', 'IF104', 2),
('15003036', 'IF102', 1);

CREATE OR REPLACE VIEW view_mahasiswa_gasal_2020_2021 AS
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
WHERE s.nama_semester = 'Gasal 2020-2021';
