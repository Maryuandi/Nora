# Modul Fitur Sistem Process Intelligence - v1.3

Tanggal: 17 Oktober 2026.

Acuan: [Arsitektur baseline v1.3](architecture-v1.3.md).

Dokumen ini memecah sistem akhir menjadi batas tanggung jawab fitur. Modul dapat berada dalam satu backend modular dengan worker terpisah sesuai beban. Pembagian ini tidak menetapkan jumlah halaman antarmuka, microservice, atau deployment.

## Implementasi backend/API v1.3

Frontend dan API aplikasi menggunakan Next.js App Router + TypeScript pada runtime Node.js. Endpoint HTTP menggunakan Route Handlers. Logika modul berada pada lapisan service/domain yang terpisah dari komponen UI dan handler HTTP.

Zod menjadi sumber definisi skema, inferensi tipe TypeScript, dan validasi runtime untuk request API, payload/hasil pekerjaan, serta struktur keluaran model. Kontrak JSON Schema diekspor dari skema yang kompatibel untuk dipakai validator pada worker Python. Pemeriksaan skema tidak menggantikan aturan bisnis, pemeriksaan kewenangan, atau tinjauan bukti.

Worker TypeScript terpisah menjalankan pipeline panjang melalui Temporal, termasuk sinkronisasi, retrieval, pemanggilan Jev/LLM, pemeriksaan aturan, dan ekspor berat. Worker Python menjalankan PM4Py/pandas dan SimPy. Route Handler hanya memulai pekerjaan, membaca status, atau mengambil hasil; tidak menjalankan seluruh analisis dalam satu request.

| Lapisan eksekusi | Tanggung jawab |
|---|---|
| Next.js UI | Dashboard, formulir konfigurasi, kasus, framework interaktif, dan review |
| Route Handlers Node.js | Endpoint proyek, aturan, sumber, webhook, pemicu analisis, status, dan hasil; validasi input serta autentikasi/otorisasi |
| Service/domain TypeScript | Logika 13 modul, aturan bisnis, retrieval, kontrak, dan akses data; dapat dipakai route maupun worker |
| Worker TypeScript + Temporal | Sinkronisasi dan pipeline analisis yang tahan gangguan, pemanggilan model, serta pekerjaan panjang |
| Worker Python | Pengolahan event PM4Py/pandas dan simulasi SimPy melalui kontrak pekerjaan berversi |

**TL;DR implementasi:** Next.js menyatukan web dan API, sementara pekerjaan analisis tetap berjalan pada worker terpisah.

## Prinsip yang dipertahankan

- PM4Py dan kode menggali proses serta menghitung metrik.
- Jev memproses penilaian semantik terstruktur berdasarkan konteks, pilihan, dan rubrik eksplisit.
- Kode memeriksa aturan, referensi, angka, dan syarat kandidat.
- LLM menjelaskan hasil beserta bukti dan ketidakpastiannya; kandidat hipotesis atau intervensi dipelihara analis dalam katalog.
- Analis dan pemilik proses menetapkan keputusan serta tindak lanjut.
- Context graph menyediakan konteks melalui aplikasi; LLM memperoleh hasil Jev sekaligus bukti asli yang relevan.
- Metrik terukur, interpretasi model, hipotesis, keputusan, dan hasil aktual memiliki status serta asal-usul terpisah.

## Peran pengguna yang diusulkan

| Peran | Tanggung jawab |
|---|---|
| Administrator proyek/integrasi | Mengatur akses, sumber data, koneksi, dan operasional proyek |
| Analis/konsultan Javan | Menentukan konteks bisnis, menyelidiki temuan, menilai kandidat, menyusun rekomendasi dan laporan |
| Pemilik proses klien | Memeriksa konteks operasional, menetapkan tindakan sesuai kewenangan, dan meninjau hasil |

Pembagian peran ini perlu dicocokkan dengan pekerjaan dan kewenangan aktual Javan serta klien.

## Peta modul

| Area | ID | Modul |
|---|---|---|
| Fondasi proyek dan data | M01 | Manajemen klien, proyek, akses, dan kontrak |
| Fondasi proyek dan data | M02 | Integrasi sumber dan sinkronisasi |
| Fondasi proyek dan data | M03 | Penyiapan dan kualitas data |
| Fondasi proyek dan data | M04 | Konteks bisnis, model, aturan, dan katalog |
| Pemahaman proses | M05 | Peta proses dan penelusuran kasus |
| Pemahaman proses | M06 | Monitoring performa dan kesesuaian |
| Pemahaman proses | M07 | Jejak bukti dan pengetahuan proses |
| Penilaian dan rekomendasi | M08 | Klasifikasi dan penilaian terstruktur |
| Penilaian dan rekomendasi | M09 | Rekomendasi, validasi, dan uji skenario |
| Penilaian dan rekomendasi | M10 | Interpretasi hasil |
| Kerja analis dan evaluasi | M11 | Investigasi, kolaborasi, dan review |
| Kerja analis dan evaluasi | M12 | Framework analisis, laporan, dan ekspor |
| Kerja analis dan evaluasi | M13 | Tindak lanjut dan evaluasi intervensi |

## A. Fondasi proyek dan data

### M01. Manajemen klien, proyek, akses, dan kontrak

**Tujuan:** memberi batas konteks dan kewenangan bagi pekerjaan konsultasi.

Fitur:

- Membuat klien, proyek, cakupan proses, dan periode analisis/kontrak.
- Menetapkan anggota, peran, serta akses terhadap data dan hasil.
- Mengatur kewenangan koneksi, penghentian sinkronisasi, dan penyimpanan sesuai kontrak.
- Menampilkan status proyek dan aktivitas pentingnya.

**Keluaran:** ruang proyek dengan kebijakan akses dan siklus hidup yang jelas.

**Pendukung:** Next.js UI/Route Handlers, service TypeScript, PostgreSQL, dan kontrol akses lintas penyimpanan. Menjadi konteks bagi semua modul.

### M02. Integrasi sumber dan sinkronisasi

**Tujuan:** mengambil data proses dari sumber yang diizinkan secara berulang.

Fitur:

- Impor log, koneksi API, atau koneksi database sesuai kemampuan sumber.
- Sinkronisasi terjadwal atau berbasis event jika sumber mendukungnya.
- Pencatatan posisi sinkronisasi, kegagalan, percobaan ulang, dan kesegaran data.
- Penyimpanan sumber asli serta metadata sumber dan pengambilan.
- Pengambilan ulang yang dapat diproses tanpa menggandakan event.

**Masukan:** konfigurasi sumber dari M01. **Keluaran:** data sumber dan status sinkronisasi.

**Pendukung:** Route Handlers untuk konfigurasi/webhook dan pemicu pekerjaan; adapter pada worker TypeScript, Temporal, object storage, dan PostgreSQL. Sinkronisasi berkelanjutan tidak bergantung pada umur request Next.js. Memasok M03.

### M03. Penyiapan dan kualitas data

**Tujuan:** membentuk event serta hubungan objek yang dapat dipercaya.

Fitur:

- Memetakan kolom, label aktivitas, format waktu, dan zona waktu.
- Menentukan identitas event/kasus/objek dan relasi lintas proses berdasarkan penghubung bisnis yang valid.
- Menandai duplikasi, nilai hilang, urutan ambigu, serta aktivitas atau kasus yang belum selesai.
- Menyediakan laporan kualitas, antrean perbaikan, dan riwayat pemetaan.
- Menyatakan analisis yang tersedia atau terbatas berdasarkan atribut data.

**Masukan:** M02 dan definisi bisnis M04. **Keluaran:** data event/objek terstandar, laporan kualitas, serta versi pemetaan.

**Pendukung:** pandas pada worker Python; skema Zod dan validasi runtime pada layanan TypeScript; kontrak JSON Schema berversi untuk validasi di worker Python; model event/objek yang mendukung OCEL. Memasok M05-M08 dan M13.

### M04. Konteks bisnis, model, aturan, dan katalog

**Tujuan:** menetapkan arti bisnis dan pembanding analisis.

Fitur:

- Menyimpan SOP, BPMN, SLA, kalender kerja, dan pengecualian.
- Memetakan aktivitas dan atribut log ke model serta aturan yang ditinjau analis.
- Menetapkan batas awal/akhir proses, definisi rework, serta populasi metrik.
- Memelihara katalog hipotesis, intervensi, rubrik penilaian, dan syarat penerapan.
- Memberi versi, tanggal berlaku, sumber, dan status tinjauan setiap konfigurasi.

**Keluaran:** konteks serta aturan yang dapat digunakan mesin dan ditelusuri ke sumber.

**Pendukung:** PostgreSQL, object storage, dan representasi relasi di M07. SOP tidak otomatis diperlakukan sebagai aturan eksekusi tanpa pemetaan yang ditinjau.

**TL;DR area A:** menetapkan proyek, menghubungkan sumber, memeriksa data, dan menentukan makna bisnisnya.

## B. Pemahaman proses

### M05. Peta proses dan penelusuran kasus

**Tujuan:** memahami alur yang benar-benar terjadi.

Fitur:

- Discovery alur aktual dan variasi pelaksanaan.
- Timeline kasus dan penelusuran urutan event.
- Filter menurut periode, jenis kasus, unit, atau atribut yang tersedia.
- Penelusuran hubungan objek lintas proses, misalnya PO-invoice-penerimaan barang.
- Membuka rincian dan sumber event yang membentuk suatu pola.

**Masukan:** M03 dan M04. **Keluaran:** peta proses, variasi, dan trace kasus.

**Pendukung:** worker Python PM4Py dan kode analitik; Next.js menyajikan hasil dengan komponen klien React Flow. Terhubung dengan M07.

### M06. Monitoring performa dan kesesuaian

**Tujuan:** menunjukkan perubahan performa dan indikasi masalah.

Fitur:

- Durasi penyelesaian kasus, jeda aktivitas, median/P90, volume, serta cakupan data.
- Indikasi bottleneck dan rework berdasarkan definisi yang disepakati.
- Pemeriksaan SLA, model proses, dan aturan bisnis yang didukung data.
- Backlog, umur kasus terbuka, tren, dan pembandingan kelompok/periode yang layak.
- Penandaan temuan baru atau memburuk; ambang/notifikasi dikonfigurasi dalam proyek.
- Penelusuran setiap temuan ke filter, rumus, versi, dan kasus pendukung.

**Masukan:** M03-M05. **Keluaran:** metrik, temuan, status kesesuaian, dan sinyal perubahan.

**Pendukung:** worker PM4Py, aturan pada service/worker TypeScript, PostgreSQL, serta Recharts pada UI Next.js. Temuan terukur tidak langsung menetapkan penyebab atau pelanggaran tanpa dasar pembanding.

### M07. Jejak bukti dan pengetahuan proses

**Tujuan:** menjawab dari mana temuan berasal dan informasi apa yang berhubungan.

Fitur:

- Menghubungkan sumber, objek bisnis, aktivitas, departemen, aturan, perhitungan, temuan, dan keputusan.
- Menampilkan asal-usul hasil: sumber, filter, rumus, pemetaan, versi data/aturan/model.
- Membedakan hubungan observasi, dukungan hipotesis, dan keputusan yang ditinjau.
- Mengambil konteks relevan sesuai pertanyaan dan hak akses untuk M08-M10.
- Memperbarui graph dari catatan otoritatif dan menunjukkan kesegaran representasinya.

**Masukan:** catatan otoritatif dari modul lain. **Keluaran:** jalur bukti, konteks yang dipilih aplikasi, dan riwayat pengetahuan proyek.

**Pendukung:** Neo4j dan layanan retrieval TypeScript yang dipakai backend Next.js serta worker sesuai kebutuhan. Modul ini adalah kemampuan bersama, bukan langkah tunggal dalam pipeline atau bukti kausalitas.

**TL;DR area B:** tampilkan pelaksanaan aktual, temukan sinyal masalah, dan buka bukti di baliknya.

## C. Penilaian dan rekomendasi

### M08. Klasifikasi dan penilaian terstruktur

**Tujuan:** memproses bagian semantik yang tidak cukup ditangani perhitungan biasa.

Fitur:

- Klasifikasi catatan pengembalian, penolakan, atau keterangan aktivitas.
- Penilaian relevansi kandidat hipotesis/intervensi berdasarkan rubrik eksplisit.
- Penyimpanan pilihan, skor/probabilitas yang tersedia, ketidakpastian, sumber, dan versi model.
- Status informasi tidak cukup atau perlu review serta antrean tinjauan.
- Koreksi label oleh analis, dengan hasil model asli dan koreksi disimpan terpisah.

**Masukan:** temuan M06, konteks M07, dan katalog/rubrik M04. **Keluaran:** hasil penilaian terstruktur yang masih dibedakan dari fakta sumber dan keputusan manusia.

**Pendukung:** Jev melalui layanan model TypeScript; pemrosesan batch berjalan pada worker Temporal dan hasil dibaca melalui API Next.js. Perhitungan numerik tetap dikerjakan kode; hasilnya tidak menjamin penyebab atau keberhasilan tindakan.

### M09. Rekomendasi, validasi, dan uji skenario

**Tujuan:** menyusun kandidat tindakan yang memenuhi syarat dan layak ditinjau.

Fitur:

- Menggabungkan penilaian M08 dengan temuan terukur dan kandidat dari M04/tambahan analis.
- Memeriksa angka, sumber, versi aturan, kewenangan, dan syarat yang dapat dihitung.
- Menghitung prioritas melalui kebijakan/bobot eksplisit; menandai asumsi usaha/risiko yang belum tersedia.
- Membandingkan kandidat beserta bukti, pengecualian, dan informasi yang masih kurang.
- Uji skenario alur, kapasitas, atau antrean ketika parameter dan modelnya memadai.
- Menyusun usulan uji coba dengan metrik keberhasilan dan batasan.

**Masukan:** M04, M06-M08 dan masukan analis. **Keluaran:** kandidat tervalidasi, kandidat belum layak dinilai, prioritas, dan skenario dengan asumsi terlihat.

**Pendukung:** service/worker aturan TypeScript, PostgreSQL, dan worker Python SimPy untuk skenario terkalibrasi. Hasil prediksi/simulasi dipisahkan dari hasil aktual M13.

### M10. Interpretasi hasil

**Tujuan:** menjadikan hasil analisis dan penilaian dapat dipahami dalam konteks bisnis.

Fitur:

- Menjelaskan temuan, hasil Jev, prioritas, dan rekomendasi yang telah diperiksa.
- Menyatakan dasar bukti, asumsi, ketidakpastian, serta pertanyaan terbuka.
- Menyediakan narasi terstruktur untuk workspace, framework, dan laporan.
- Memeriksa struktur keluaran dan referensi sumber; klaim substantif tetap ditinjau analis.

**Masukan:** hasil Jev, keluaran M09, serta bukti asli/aturan dari M07. **Keluaran:** draf interpretasi yang dapat ditelusuri.

**Pendukung:** LLM melalui layanan model TypeScript pada pipeline worker, dengan kontrak serta validasi runtime Zod pada sisi TypeScript. Next.js menyajikan hasil serta statusnya. LLM tidak mengubah angka, memperkenalkan intervensi baru sebagai keputusan, atau mengganti hasil evaluasi tanpa melalui alur penilaian/tinjauan.

**TL;DR area C:** Jev menilai, kode memeriksa serta memprioritaskan, simulasi membantu perbandingan, dan LLM menjelaskan.

## D. Kerja analis dan evaluasi

### M11. Investigasi, kolaborasi, dan review

**Tujuan:** mengubah keluaran sistem menjadi keputusan yang ditinjau pengguna berwenang.

Fitur:

- Membuka temuan, kasus, aturan, dan kandidat dalam satu workspace.
- Mencatat hasil wawancara, bukti tambahan, hipotesis alternatif, komentar, dan pertanyaan investigasi.
- Meninjau hasil Jev/LLM, mengoreksi label, serta menandai alasan persetujuan/penolakan.
- Menetapkan perlu investigasi, usulan uji coba, dipilih, ditolak, atau digantikan.
- Mencatat peninjau, kewenangan, waktu, alasan, dan versi keputusan.

**Masukan:** M05-M10. **Keluaran:** analisis yang telah ditinjau, keputusan, serta pembaruan konteks dan katalog bila disepakati.

**Pendukung:** Next.js UI/Route Handlers, service TypeScript, PostgreSQL, dan M07. Keputusan terhadap hasil lama ditandai untuk ditinjau ulang jika data/aturan berubah.

### M12. Framework analisis, laporan, dan ekspor

**Tujuan:** mendukung diskusi analisis dan komunikasi hasil kepada klien.

Fitur:

- Fishbone/problem tree untuk mengorganisasi hipotesis, Pareto untuk prioritas masalah, dan matriks dampak-usaha ketika atributnya tersedia.
- Menyunting node, hubungan, catatan, serta tautan ke bukti.
- Menampilkan status terukur, hipotesis, dan ditinjau; draft tetap dibedakan dari versi yang disahkan.
- Membentuk laporan dan deck dari objek analisis yang sama; menyimpan snapshot versi yang dipublikasikan.
- Ekspor gambar, PDF, dan presentasi sesuai kebutuhan produk serta format yang didukung implementasi.

**Masukan:** M05-M11. **Keluaran:** framework yang dapat diedit dan artefak komunikasi berversi.

**Pendukung:** React Flow dan Recharts dalam komponen klien Next.js, layanan template/ekspor, serta narasi M10 yang telah ditinjau. Ekspor panjang dijalankan pada worker dan hasilnya diakses melalui API. Framework tidak membuktikan hubungan sebab-akibat dengan sendirinya.

### M13. Tindak lanjut dan evaluasi intervensi

**Tujuan:** mengetahui apa yang dilaksanakan dan bagaimana hasilnya.

Fitur:

- Mencatat tindakan, pemilik, jadwal, kondisi penerapan, dan status pelaksanaan.
- Menetapkan metrik, baseline, kelompok/periode pembanding, dan tanggal perubahan.
- Mengukur ulang performa, rework, SLA, dan backlog menggunakan data baru.
- Membandingkan hasil aktual dengan target dan estimasi skenario sambil mencatat perubahan lain yang relevan.
- Menyimpan hasil, keterbatasan evaluasi, serta keputusan melanjutkan, memperbaiki, atau menghentikan tindakan.

**Masukan:** keputusan M11, rencana M09, dan data baru M02-M06. **Keluaran:** evaluasi aktual dan pelajaran proyek yang kembali ke M07/M04 melalui tinjauan.

**Pendukung:** worker PM4Py, service/worker TypeScript, Temporal, PostgreSQL, dan UI tindak lanjut Next.js. Perbandingan sebelum/sesudah tidak otomatis membuktikan dampak kausal. Intervensi diterapkan melalui prosedur klien.

**TL;DR area D:** analis menyelidiki dan memutuskan, framework mengomunikasikan, lalu hasil tindakan diukur kembali.

## Alur utama dan ketergantungan

1. M01 menetapkan konteks proyek dan akses.
2. M02 menerima data; M03 menstandarkan dan memeriksa kualitasnya.
3. M04 menetapkan model, definisi, aturan, dan katalog yang ditinjau.
4. M05-M06 menghasilkan peta, metrik, dan temuan.
5. M07 menghubungkan bukti dan menyediakan konteks sesuai kewenangan.
6. M08 menghasilkan penilaian Jev; M09 memeriksa dan menyusun kandidat serta skenario.
7. M10 menghasilkan interpretasi LLM.
8. M11 menjadi tempat investigasi dan keputusan; M12 dapat dipakai selama investigasi maupun setelah review.
9. M13 mengukur hasil tindakan, sementara M02-M06 terus memperbarui pengamatan.

M07 serta M01 adalah kemampuan lintas modul. Pembaruan data, aturan, katalog, atau keputusan dapat memicu analisis/review ulang melalui orkestrasi; urutan di atas menggambarkan alur utama, bukan satu rantai sinkron untuk semua operasi.

## Alur eksekusi analisis pada Next.js

1. UI mengirim `POST /api/analyses` dengan proyek, referensi dataset, dan konfigurasi.
2. Route Handler memvalidasi input serta kewenangan klien/proyek, lalu mencatat permintaan dan memulai workflow Temporal secara idempoten. Operasi pencatatan/pemicu harus dapat direkonsiliasi bila salah satunya gagal.
3. Setelah pekerjaan tercatat/terjadwal, API mengembalikan respons `202 Accepted` dengan `analysisId` dan status awal. Respons ini tidak menyatakan analisis sudah selesai.
4. Workflow dan worker menjalankan tahapan data, PM4Py, Jev, aturan, serta interpretasi LLM. Dataset besar tetap di penyimpanan; payload pekerjaan membawa referensi dan versi.
5. Worker menyimpan progres, manifest hasil, dan hubungan bukti. UI membaca status/hasil melalui `GET /api/analyses/{analysisId}` dengan pemeriksaan akses yang sama.
6. Review dan keputusan M11 disimpan oleh service TypeScript. Tindak lanjut M13 dapat memicu analisis berikutnya.

**Batas implementasi:** Route Handler, Server Action, dan Server Component menggunakan service/domain bersama. Server Component tidak perlu memanggil endpoint HTTP aplikasi sendiri untuk membaca data. Server Action dapat dipakai untuk mutasi UI, tetapi tidak menggantikan worker atau endpoint webhook/integrasi. Semua operasi server tetap memeriksa kewenangan, dan hasil lintas klien tidak boleh tercampur melalui cache.

**TL;DR eksekusi:** API menerima dan menjadwalkan; worker memproses; UI mengambil progres dan hasil.

## Kontrak validasi TypeScript dan Python

- **Sumber skema:** definisikan skema Zod bersama pada paket kontrak TypeScript yang dapat digunakan Next.js dan worker TypeScript. Tipe diambil dari skema, bukan dipelihara ulang secara manual.
- **Batas yang diperiksa:** request API, payload/hasil pekerjaan, dan struktur keluaran Jev/LLM. Validasi struktur keluaran tidak menyatakan klasifikasi atau penjelasannya benar.
- **Worker Python:** menerima payload JSON dan memvalidasinya dengan validator JSON Schema yang sesuai. Worker Python tidak mengimpor atau menjalankan Zod.
- **Ekspor kontrak:** gunakan `z.toJSONSchema()` untuk skema yang dapat direpresentasikan; simpan versi kontrak dan target draft JSON Schema yang didukung kedua sisi.
- **Bentuk data lintas bahasa:** gunakan objek, array, string, angka yang sesuai kontrak, boolean, serta null bila diperbolehkan. Waktu dikirim sebagai string ISO sesuai format yang ditetapkan; hindari objek JavaScript Date atau transformasi khusus pada kontrak yang harus diekspor.
- **Aturan tambahan:** pemeriksaan bisnis atau custom logic yang tidak terwakili dalam JSON Schema tetap eksplisit pada lapisan aplikasi/worker yang bertanggung jawab. Jangan melonggarkan kontrak ekspor diam-diam untuk menghindari kegagalan konversi.
- **Konsistensi:** uji contoh payload valid/tidak valid pada kedua validator, termasuk aturan format yang dikonfigurasi, sebelum memperbarui versi kontrak. Simpan kegagalan validasi tanpa memasukkan data invalid sebagai hasil analisis.

**TL;DR kontrak:** Zod digunakan pada TypeScript; JSON Schema berversi menjadi kontrak validasi bagi Python.

## Layanan teknis bersama

| Layanan | Fungsi lintas modul |
|---|---|
| Web, API, dan validasi | Next.js App Router/Route Handlers pada Node.js, TypeScript, Zod untuk definisi skema, inferensi tipe, dan validasi runtime; pemeriksaan kewenangan tetap di service server |
| Orkestrasi dan worker | Temporal dengan worker TypeScript untuk workflow/pipeline aplikasi serta activity worker Python untuk mining/simulasi; kontrak payload berversi, jadwal, status, pemulihan, percobaan ulang, dan idempotensi operasi |
| Penyimpanan dan versi | PostgreSQL, object storage, snapshot, serta referensi sumber |
| Retrieval dan graph | Pemilihan bukti relevan, isolasi akses, konsistensi versi graph |
| Audit dan operasional | Aktivitas, kesegaran data, kegagalan pekerjaan, backup, serta evaluasi model |
| Penyajian dan ekspor | Komponen UI, diagram, grafik, template, dan pembentukan artefak |

Keamanan, kualitas data, dan penelusuran bukti merupakan syarat setiap modul. Kebutuhan, prioritas, dan rincian pekerjaan pengguna perlu divalidasi bersama Javan; daftar ini adalah pemecahan rancangan sistem akhir.

## Riwayat revisi dan rujukan

v1.3 menggunakan Zod untuk definisi skema, inferensi tipe, dan validasi runtime di Next.js/worker TypeScript. JSON Schema yang kompatibel diekspor sebagai kontrak worker Python. Ketiga belas modul dan peran PM4Py, Jev, kode, LLM, serta analis mengikuti baseline logis.

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js sebagai Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Runtime dan batas durasi deployment](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
- [Temporal TypeScript](https://docs.temporal.io/develop/typescript)
- [Zod: definisi skema dan validasi](https://zod.dev/basics)
- [Zod: ekspor JSON Schema dan batas konversi](https://zod.dev/json-schema)
