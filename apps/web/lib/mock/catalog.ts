import type { Condition, ConfigData } from "./types";

// Starter P2P catalog, compiled from process mining literature. All entries stay "perlu validasi Javan" until an analyst saves them.
const need = (subject: string): Condition => ({ kind: "capability", subject, op: "ada", value: "" });
const metric = (subject: string, value: string): Condition => ({ kind: "metric", subject, op: ">", value });

const H: { key: string; name: string; statement: string; symptom: string; evidence: string; conditions: Condition[] }[] = [
  { key: "h01", name: "Persetujuan PO menumpuk", statement: "Persetujuan PO menumpuk pada sedikit approver.", symptom: "Waktu tunggu tinggi sebelum aktivitas persetujuan", evidence: "Durasi antar aktivitas per sumber daya", conditions: [need("atribut sumber daya")] },
  { key: "h02", name: "PO sering diubah", statement: "Spesifikasi PO tidak lengkap sehingga PO diubah berulang.", symptom: "Rasio rework pada aktivitas perubahan PO", evidence: "Frekuensi aktivitas perubahan per kasus", conditions: [metric("rasio rework aktivitas perubahan PO (%)", "10")] },
  { key: "h03", name: "Pemasok terlambat kirim", statement: "Pemasok tertentu terlambat mengirim barang.", symptom: "Durasi PO ke penerimaan barang melebihi SLA", evidence: "Durasi per pemasok", conditions: [need("atribut pemasok")] },
  { key: "h04", name: "Three-way match gagal", statement: "Invoice dicatat sebelum barang diterima.", symptom: "Pelanggaran urutan penerimaan barang dan invoice", evidence: "Pasangan urutan aktivitas per kasus", conditions: [] },
  { key: "h05", name: "Invoice duplikat", statement: "Invoice duplikat memicu pembatalan dan pencatatan ulang.", symptom: "Pembatalan invoice yang tinggi", evidence: "Jumlah aktivitas pembatalan per pemasok", conditions: [metric("rasio rework pencatatan invoice (%)", "5")] },
  { key: "h06", name: "Antrean akhir bulan", statement: "Pembayaran terlambat karena antrean persetujuan akhir bulan.", symptom: "Lonjakan durasi pada minggu terakhir bulan", evidence: "Durasi menurut tanggal mulai kasus", conditions: [] },
  { key: "h07", name: "Data pemasok salah", statement: "Data master pemasok salah menyebabkan rework pencatatan invoice.", symptom: "Rework pada pencatatan invoice", evidence: "Varian jalur dengan pengulangan aktivitas", conditions: [need("atribut pemasok")] },
  { key: "h08", name: "Pemisahan tugas dilanggar", statement: "Pengguna dengan banyak peran melanggar pemisahan tugas.", symptom: "Kasus dengan pelaksana sama pada aktivitas yang harus terpisah", evidence: "Pelaksana per aktivitas per kasus", conditions: [need("atribut sumber daya")] },
  { key: "h09", name: "Jalur sama untuk semua nilai", statement: "PO bernilai kecil melalui jalur persetujuan yang sama dengan PO bernilai besar.", symptom: "Durasi PO kecil mendekati PO besar", evidence: "Durasi menurut nilai PO", conditions: [{ kind: "case_attr", subject: "nilai PO", op: "ada", value: "" }] },
  { key: "h10", name: "Beban tim tidak merata", statement: "Beban kerja tidak merata antar tim pembelian.", symptom: "Selisih durasi antar tim", evidence: "Durasi dan volume per sumber daya", conditions: [need("atribut sumber daya")] },
];

const I: { name: string; action: string; hyp: string[]; prerequisites: string; metric: string; conditions: Condition[] }[] = [
  { name: "Delegasi persetujuan", action: "Tetapkan approver cadangan dan batas waktu persetujuan.", hyp: ["h01"], prerequisites: "Persetujuan manajemen", metric: "Median waktu tunggu persetujuan", conditions: [need("atribut sumber daya")] },
  { name: "Templat PO baku", action: "Gunakan templat PO dengan kolom wajib.", hyp: ["h02"], prerequisites: "Perubahan formulir PO", metric: "Rasio perubahan PO", conditions: [] },
  { name: "Evaluasi kinerja pemasok", action: "Skor ketepatan pengiriman pemasok dan tinjau berkala.", hyp: ["h03"], prerequisites: "Data pemasok per PO", metric: "Persentase kiriman tepat waktu", conditions: [need("atribut pemasok")] },
  { name: "Blokir pembayaran otomatis", action: "Blokir pembayaran sampai tiga dokumen cocok.", hyp: ["h04"], prerequisites: "Konfigurasi ERP", metric: "Pelanggaran three-way match", conditions: [] },
  { name: "Deteksi invoice duplikat", action: "Aktifkan pemeriksaan duplikat saat invoice dicatat.", hyp: ["h05"], prerequisites: "Konfigurasi ERP", metric: "Jumlah pembatalan invoice", conditions: [] },
  { name: "Jadwal persetujuan terpusat", action: "Ratakan persetujuan sepanjang bulan.", hyp: ["h06"], prerequisites: "Kalender penutupan", metric: "Durasi minggu terakhir bulan", conditions: [] },
  { name: "Pembersihan data master pemasok", action: "Validasi dan bersihkan data master pemasok.", hyp: ["h07"], prerequisites: "Akses data master", metric: "Rasio rework invoice", conditions: [need("atribut pemasok")] },
  { name: "Peninjauan peran pengguna", action: "Tinjau dan pisahkan peran pengguna yang berlebih.", hyp: ["h08"], prerequisites: "Daftar peran", metric: "Kasus melanggar pemisahan tugas", conditions: [need("atribut sumber daya")] },
  { name: "Jalur cepat PO bernilai kecil", action: "Sederhanakan persetujuan untuk PO di bawah ambang.", hyp: ["h09"], prerequisites: "Kebijakan ambang nilai", metric: "Durasi PO bernilai kecil", conditions: [{ kind: "case_attr", subject: "nilai PO", op: "ada", value: "" }] },
  { name: "Penugasan antrean otomatis", action: "Bagikan pekerjaan berdasarkan beban tim.", hyp: ["h10"], prerequisites: "Aturan distribusi", metric: "Selisih durasi antar tim", conditions: [need("atribut sumber daya")] },
];

const RUBRIC: ConfigData = {
  kind: "rubric",
  criteria: [
    { name: "Dukungan bukti", weight: 40, scale: [{ value: 1, definition: "Bukti lemah atau tidak langsung" }, { value: 2, definition: "Bukti sebagian" }, { value: 3, definition: "Bukti kuat dari data" }] },
    { name: "Dampak", weight: 35, scale: [{ value: 1, definition: "Dampak kecil" }, { value: 2, definition: "Dampak sedang" }, { value: 3, definition: "Dampak besar" }] },
    { name: "Kemudahan penerapan", weight: 25, scale: [{ value: 1, definition: "Sulit" }, { value: 2, definition: "Sedang" }, { value: 3, definition: "Mudah" }] },
  ],
};

/** Catalog entries for a new project. Keys are namespaced by project so they stay unique in the mock store. */
export function starterCatalog(projectId: string): { key: string; name: string; data: ConfigData }[] {
  const key = (k: string) => `${k}-${projectId}`;
  return [
    ...H.map((h) => ({ key: key(h.key), name: h.name, data: { kind: "hypothesis", statement: h.statement, symptom: h.symptom, evidence: h.evidence, conditions: h.conditions } as ConfigData })),
    ...I.map((i, n) => ({
      key: key(`i${String(n + 1).padStart(2, "0")}`), name: i.name,
      data: { kind: "intervention", action: i.action, hypotheses: i.hyp.map(key), prerequisites: i.prerequisites, effort: null, risk: null, metric: i.metric, conditions: i.conditions } as ConfigData,
    })),
    { key: key("rubrik"), name: "Rubrik penilaian P2P", data: RUBRIC },
  ];
}
