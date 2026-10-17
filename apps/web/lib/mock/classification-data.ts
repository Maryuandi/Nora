import type { ClassItem } from "./types";

export type ClassFixtureEntry = { top: string; p: number; second?: string; p2?: number };

const e = (top: string, p: number, second?: string, p2?: number): ClassFixtureEntry => (second ? { top, p, second, p2 } : { top, p });

// Fixed per-item model output so the demo is stable (no randomness). The rest of the mass is split evenly over the other categories.
export const CLASS_FIXTURE: Record<string, ClassFixtureEntry> = {
  a01: e("pembuatan", 0.93), a02: e("pembuatan", 0.52, "pencatatan_dokumen", 0.41), a03: e("penerimaan", 0.88), a04: e("pencatatan_dokumen", 0.84),
  a05: e("pembayaran", 0.81), a06: e("persetujuan", 0.55, "perubahan", 0.38), a07: e("perubahan", 0.91), a08: e("perubahan", 0.9),
  a09: e("perubahan", 0.86), a10: e("pembatalan", 0.89), a11: e("pembatalan", 0.79), a12: e("pembatalan", 0.77),
  a13: e("penerimaan", 0.72, "pencatatan_dokumen", 0.2), a14: e("perubahan", 0.58, "pencatatan_dokumen", 0.33), a15: e("persetujuan", 0.83),
  a16: e("persetujuan", 0.94), a17: e("pembuatan", 0.92), a18: e("lainnya", 0.46, "pembuatan", 0.44), a19: e("lainnya", 0.62, "pembayaran", 0.3),
  a20: e("lainnya", 0.87),
  n01: e("harga_tidak_sesuai", 0.9), n02: e("kuantitas_tidak_sesuai", 0.88), n03: e("dokumen_kurang", 0.85), n04: e("vendor_salah", 0.82),
  n05: e("harga_tidak_sesuai", 0.81, "lainnya", 0.1), n06: e("kuantitas_tidak_sesuai", 0.91), n07: e("harga_tidak_sesuai", 0.87),
  n08: e("dokumen_kurang", 0.79), n09: e("kuantitas_tidak_sesuai", 0.93), n10: e("kuantitas_tidak_sesuai", 0.84),
  n11: e("vendor_salah", 0.48, "dokumen_kurang", 0.43), n12: e("dokumen_kurang", 0.86), n13: e("lainnya", 0.74),
  n14: e("harga_tidak_sesuai", 0.52, "kuantitas_tidak_sesuai", 0.4), n15: e("vendor_salah", 0.8), n16: e("lainnya", 0.66),
};

const act = (id: string, text: string, context: string): ClassItem =>
  ({ id, projectId: "p-p2p", task: "aktivitas", text, context, synthetic: false });

const note = (id: string, activity: string, period: string, text: string): ClassItem =>
  ({ id, projectId: "p-p2p", task: "catatan", text, context: "Catatan sintetis", synthetic: true, activity, period });

const CA = "Change Approval for Purchase Order";
const GR = "Record Goods Receipt";

export const classItems: ClassItem[] = [
  act("a01", "Create Purchase Order Item", "Biasanya di awal alur pembelian"),
  act("a02", "Vendor creates invoice", "Biasanya muncul setelah barang dikirim vendor"),
  act("a03", GR, "Biasanya setelah barang tiba di gudang"),
  act("a04", "Record Invoice Receipt", "Biasanya setelah penerimaan barang tercatat"),
  act("a05", "Clear Invoice", "Biasanya di akhir alur, setelah faktur dicatat"),
  act("a06", CA, "Biasanya di tengah alur, sebelum PO dirilis"),
  act("a07", "Change Price", "Biasanya terjadi setelah PO dibuat"),
  act("a08", "Change Quantity", "Biasanya terjadi setelah PO dibuat"),
  act("a09", "Change Delivery Indicator", "Biasanya terjadi setelah PO dibuat, sebelum pengiriman"),
  act("a10", "Delete Purchase Order Item", "Biasanya muncul sebagai penyimpangan di tengah alur"),
  act("a11", "Cancel Goods Receipt", "Biasanya muncul setelah penerimaan barang tercatat"),
  act("a12", "Cancel Invoice Receipt", "Biasanya muncul setelah faktur dicatat"),
  act("a13", "Receive Order Confirmation", "Biasanya setelah PO dikirim ke vendor"),
  act("a14", "Update Order Confirmation", "Biasanya setelah konfirmasi pesanan pertama diterima"),
  act("a15", "Release Purchase Order", "Biasanya setelah PO selesai disetujui"),
  act("a16", "Approve Purchase Requisition", "Biasanya di awal alur, sebelum PO dibuat"),
  act("a17", "Create Purchase Requisition Item", "Biasanya di awal alur pembelian"),
  act("a18", "Reactivate Purchase Order Item", "Jarang muncul, biasanya setelah item dibatalkan"),
  act("a19", "Payment Block Set", "Biasanya muncul sebelum pembayaran dilepas"),
  act("a20", "Send Reminder", "Biasanya muncul saat pengiriman atau pembayaran terlambat"),
  note("n01", CA, "2026-07", "Harga satuan pada PO berbeda dari harga yang tercantum dalam kontrak dengan vendor, perlu penyesuaian."),
  note("n02", CA, "2026-07", "Jumlah barang yang dipesan tidak sama dengan jumlah pada permintaan pembelian, mohon cek ulang kuantitasnya."),
  note("n03", CA, "2026-07", "Lampiran penawaran dan surat persetujuan anggaran belum dilengkapi pemohon, sehingga perubahan belum bisa disetujui."),
  note("n04", CA, "2026-08", "Nama vendor pada PO keliru, seharusnya dikirim ke pemasok lain yang terdaftar untuk kategori barang ini."),
  note("n05", CA, "2026-08", "Dokumen tagihan dan lampiran kontrak belum lengkap sehingga nilai pesanan belum bisa diverifikasi."),
  note("n06", CA, "2026-08", "Jumlah barang pada pesanan lebih banyak daripada kebutuhan yang diminta, kuantitas perlu dikurangi dulu."),
  note("n07", CA, "2026-09", "Harga per unit naik dibanding pesanan sebelumnya tanpa penjelasan, mohon konfirmasi harga yang disepakati dengan vendor."),
  note("n08", CA, "2026-09", "Surat permintaan resmi dari kepala bagian belum dilampirkan, sehingga dokumen pendukung perubahan dianggap belum lengkap."),
  note("n09", GR, "2026-07", "Barang yang diterima di gudang kurang dari jumlah pada pesanan, selisih kuantitas dicatat saat penerimaan."),
  note("n10", GR, "2026-07", "Jumlah yang tertulis pada surat jalan berbeda dengan hasil hitung fisik di gudang saat barang diterima."),
  note("n11", GR, "2026-08", "Surat jalan yang dibawa kurir tercantum atas nama pemasok lain dan tidak memuat nomor pesanan."),
  note("n12", GR, "2026-08", "Berita acara pemeriksaan barang belum ditandatangani sehingga penerimaan belum dapat dicatat lengkap di sistem."),
  note("n13", GR, "2026-08", "Barang tiba lebih cepat dari jadwal dan gudang penuh, penerimaan ditunda sampai area penyimpanan tersedia."),
  note("n14", GR, "2026-09", "Nilai total penerimaan tidak sama dengan nilai pesanan, belum jelas karena harga satuan atau jumlah barangnya."),
  note("n15", GR, "2026-09", "Barang dikirim oleh vendor yang berbeda dari yang tertera pada pesanan, perlu klarifikasi data pemasok."),
  note("n16", GR, "2026-09", "Penerimaan dicatat di luar jam kerja karena pengiriman mendadak dari kurir ekspedisi pada malam hari."),
];
