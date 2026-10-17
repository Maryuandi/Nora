# Spec: M10b frontend, Interpretasi empat target lain + templat prompt (data tiruan)

Tanggal: 18 Oktober 2026. Status: disetujui pengguna untuk dikerjakan sampai selesai tanpa konfirmasi.

Acuan: [PRD M10](../../prd/m10-interpretasi-hasil-prd.md) Story 1 (lima jenis target), Fitur 2 (templat prompt). Melanjutkan [M10a](2026-10-18-m10a-frontend-design.md) di branch `feat/m10a-frontend` (worktree `nora-m10`). Menyelesaikan M10 Fase 1 sisi frontend; tetap tanpa backend, LLM nyata, biaya/token, dan penyuntingan (M11).

## Cakupan

1. **Empat jenis target baru** memakai mesin M10a yang sama (pemeriksa, generator skrip, perbaikan, override): `penilaian_kandidat` (M08), `perbandingan` (perbandingan dan prioritas kandidat, M09), `skenario` (M09), `uji_coba` (usulan uji coba, M09). Jenis `temuan` (M06) sudah ada.
2. **Templat prompt**: layar baca-saja `/interpretations/templates` yang menampilkan templat berversi per jenis target × audiens (5 × 2).

## Model

- `types.ts`: `TargetKind = "temuan" | "penilaian_kandidat" | "perbandingan" | "skenario" | "uji_coba"`; `MockFinding` bertambah `kind: TargetKind` (nama tipe dipertahankan; "target"). Tiga temuan M10a diberi `kind: "temuan"`.
- Label jenis (konstanta terekspor `TARGET_KIND_LABEL`): Temuan (M06), Penilaian kandidat (M08), Perbandingan kandidat (M09), Skenario (M09), Usulan uji coba (M09).
- `findings.ts` bertambah empat target `p-p2p`, masing-masing ≥ 5 item bukti dengan metrik konkret (satuan, versi), ≥ 1 kandidat `validated: true`, ≥ 1 kandidat `validated: false`, ≥ 1 item `aturan`, ≥ 1 item `measured: true`:
  - `assess_71` penilaian kandidat (hasil penilaian M08 untuk satu kandidat: skor dampak, kelayakan, risiko).
  - `compare_81` perbandingan dan prioritas tiga kandidat (peringkat, skor tiap kandidat; satu tervalidasi).
  - `scenario_91` skenario (basis vs skenario: durasi, pelanggaran SLA).
  - `pilot_95` usulan uji coba, `limitedContext: true` (ruang lingkup, durasi, ukuran sampel kecil).
- `interpretation-scripts.ts`: skrip dua audiens untuk tiap target baru, struktur delapan bagian sama dengan M10a, prosa tanpa digit di luar placeholder. Hasil yang disyaratkan: `assess_71`, `scenario_91`, `pilot_95` lolos di percobaan 1 (`pilot_95` memuat "konteks terbatas" di ketidakpastian); `compare_81` gagal di percobaan 1 dengan tepat satu pemeriksa `rujukan` (klaim mengutip id yang tidak ada) lalu lolos di percobaan 2. Bukti yang tidak dirujuk boleh ada.
- Seed: empat draf baru untuk `p-p2p` dari generator (total tujuh), `createdAt` berbeda, `createdBy: "u-dimas"`.
- `templates.ts` (baru, murni): `PROMPT_TEMPLATES: Array<{ kind: TargetKind; audience: Audience; version: "tiruan-1"; role: string; rules: string[] }>` sepuluh entri; `role` = instruksi peran ("menjelaskan, tidak menghitung, tidak memutuskan") disesuaikan jenis dan audiens; `rules` = aturan placeholder, rujukan, tipe klaim, dan satu aturan khusus jenis.

## Layar

- Modal "Buat interpretasi": dua pilihan, "Jenis target" (hanya jenis yang punya target di proyek) lalu "Target". Audiens tetap.
- Daftar: kolom "TEMUAN" menjadi "TARGET" dengan jenis di bawah judul; filter tambahan jenis (opsional, "Semua jenis" bawaan). Keadaan kosong: "Belum ada target untuk diinterpretasi".
- Detail: header menampilkan label jenis.
- Daftar dan detail menautkan "Templat prompt" ke `/interpretations/templates`: tabel 10 baris (jenis, audiens, versi, model tiruan) dengan baris yang bisa dibuka menampilkan peran dan aturan sebagai teks. Semua peran boleh melihat.

## Pengujian

Tes murni: tiap target baru lolos/gagal sesuai syarat di atas (kedua audiens), invarian seed (tujuh draf, status `[lolos, lolos, gagal, lolos, lolos, lolos, lolos]` menurut urutan seed, tiap sitasi ada di bukti), `PROMPT_TEMPLATES` berisi tepat 10 kombinasi unik, `TARGET_KIND_LABEL` memuat lima kunci. Verifikasi manual di browser seperti M10a.
