// Templat prompt tiruan M10b: murni, hanya impor tipe. Ditampilkan baca-saja di /interpretations/templates.
import type { Audience, TargetKind } from "./types";

export interface PromptTemplate { kind: TargetKind; audience: Audience; version: "tiruan-1"; role: string; rules: string[] }

const KIND_ROLE: Record<TargetKind, string> = {
  temuan: "temuan proses hasil analisis (M06)",
  penilaian_kandidat: "hasil penilaian satu kandidat perbaikan (M08)",
  perbandingan: "perbandingan dan prioritas beberapa kandidat (M09)",
  skenario: "hasil simulasi skenario dibanding basis (M09)",
  uji_coba: "usulan uji coba perbaikan proses (M09)",
};
const AUDIENCE_ROLE: Record<Audience, string> = {
  analis: "Tulis untuk analis proses: ringkas, teknis, dan sebutkan nama metrik serta versi bila relevan.",
  pemilik_proses: "Tulis untuk pemilik proses: bahasa sehari-hari, kalimat pendek, dan jelaskan istilah teknis seperti SLA atau rework.",
};
const KIND_RULE: Record<TargetKind, string> = {
  temuan: "Bedakan fakta terukur dari dugaan penyebab; penyebab selalu ditulis sebagai interpretasi atau hipotesis.",
  penilaian_kandidat: "Jelaskan skor dampak, kelayakan, dan risiko apa adanya; jangan menjumlahkan atau menimbang ulang skor.",
  perbandingan: "Sebut peringkat dan selisih skor dari bukti; jangan mengubah urutan, dan kandidat yang belum tervalidasi hanya boleh muncul sebagai hipotesis.",
  skenario: "Bandingkan basis dengan skenario memakai angka dari hasil simulasi, dan nyatakan parameter skenario sebagai asumsi.",
  uji_coba: "Sebut ruang lingkup, durasi, dan ukuran sampel; bila paket bukti berkonteks terbatas, tulis \"konteks terbatas\" di bagian Ketidakpastian.",
};
const AUDIENCE_RULE: Record<Audience, string> = {
  analis: "Pertahankan istilah teknis dan sebut asal angka melalui placeholder agar bisa ditelusuri.",
  pemilik_proses: "Setiap istilah teknis diberi penjelasan singkat pada kemunculan pertama dan tidak lebih dari satu gagasan per kalimat.",
};

export const PROMPT_TEMPLATES: PromptTemplate[] = (Object.keys(KIND_ROLE) as TargetKind[]).flatMap((kind) =>
  (["analis", "pemilik_proses"] as Audience[]).map((audience): PromptTemplate => ({
    kind, audience, version: "tiruan-1",
    role: `Anda menjelaskan ${KIND_ROLE[kind]}. Anda menjelaskan, tidak menghitung, dan tidak memutuskan. ${AUDIENCE_ROLE[audience]}`,
    rules: [
      "Setiap angka ditulis sebagai placeholder {{metric:<id_bukti>.<kunci_metrik>}}; jangan menulis angka sendiri di luar placeholder.",
      "Setiap klaim wajib merujuk minimal satu id item bukti yang ada di paket bukti.",
      "Beri setiap klaim satu tipe: fakta terukur, interpretasi, hipotesis, atau rekomendasi tervalidasi; fakta terukur hanya boleh merujuk bukti terukur atau aturan.",
      KIND_RULE[kind],
      AUDIENCE_RULE[audience],
    ],
  })),
);
