#!/usr/bin/env python3
"""Membangun berkas WAV "suara kandidat" untuk pengujian sesi wawancara live.

Chromium dijalankan dengan --use-file-for-fake-audio-capture sehingga berkas
ini menggantikan mikrofon fisik. Karena pewawancara AI bicara lebih dulu, tiap
jawaban didahului jeda hening agar giliran bicara tidak saling menimpa.

Hanya memakai perkakas bawaan macOS (say, afconvert) dan pustaka standar
Python, supaya tidak bergantung pada ffmpeg.
"""

import array
import random
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

random.seed(20260726)  # berkas uji harus reprodusibel

VOICE = "Damayanti"  # id_ID, bawaan macOS
RATE = 48000
OUT = Path(__file__).parent / "candidate-answers.wav"

# (jeda hening sebelum jawaban dalam detik, teks jawaban)
# Jawaban disusun terstruktur STAR dan bertumpu pada butir-butir CV (API 50.000
# permintaan per hari, migrasi MySQL ke PostgreSQL, optimasi 40 persen), karena
# pertanyaan pewawancara AI selalu digali dari CV tersebut. Naskah tetap dan
# tidak adaptif, sehingga kecocokannya dengan pertanyaan tidak pernah sempurna.
SCRIPT = [
    (
        17,
        "Baik, terima kasih. Perkenalkan, saya Andri Hari Musyaffa, lulusan "
        "Teknik Informatika Universitas Bina Nusantara dengan tiga tahun "
        "pengalaman sebagai backend engineer. Menjawab pertanyaan Anda: "
        "situasinya, layanan API kami harus melayani lima puluh ribu "
        "permintaan per hari. Tugas saya adalah menjaga waktu respons tetap "
        "rendah. Yang saya lakukan, saya menambahkan indeks pada kolom yang "
        "sering dikueri, menerapkan cache pada endpoint yang paling sering "
        "dipanggil, dan mengatur connection pooling. Hasilnya, waktu respons "
        "turun sekitar empat puluh persen.",
    ),
    (
        22,
        "Tentu. Situasinya, kami perlu memindahkan basis data dari MySQL ke "
        "PostgreSQL tanpa menghentikan layanan. Tugas saya memimpin migrasi "
        "itu. Langkah yang saya ambil, saya melakukan replikasi ganda selama "
        "dua minggu, menulis skrip verifikasi yang membandingkan jumlah baris "
        "dan checksum tiap tabel, lalu memindahkan trafik secara bertahap. "
        "Hasilnya, migrasi selesai tanpa kehilangan data dan tanpa waktu henti "
        "yang terasa oleh pengguna.",
    ),
    (
        22,
        "Untuk pemantauan dan optimasi, saya biasa memakai log kueri lambat "
        "dan perintah explain analyze untuk menemukan kueri yang bermasalah. "
        "Contohnya, situasinya sistem pembayaran sempat terganggu pada jam "
        "sibuk. Tugas saya menemukan akar masalahnya. Saya menganalisis log "
        "dan menemukan kebocoran koneksi basis data. Hasilnya, sistem kembali "
        "stabil dalam tiga puluh menit dan saya menambahkan alarm agar "
        "masalah serupa terdeteksi lebih awal.",
    ),
    (
        22,
        "Dalam berkolaborasi dengan tim frontend, saya terbiasa menyepakati "
        "kontrak API lebih dahulu menggunakan dokumentasi OpenAPI sebelum "
        "implementasi dimulai. Jika ada perbedaan kebutuhan, saya mengajak "
        "diskusi singkat dengan membawa data, misalnya dampaknya terhadap "
        "waktu respons, agar keputusan diambil berdasarkan fakta dan bukan "
        "asumsi. Kelebihan saya ketelitian, sedangkan kekurangan saya kadang "
        "terlalu perfeksionis, yang saya kelola dengan menetapkan tenggat "
        "yang jelas.",
    ),
    (
        22,
        "Dalam lima tahun ke depan saya ingin berkembang menjadi arsitek "
        "perangkat lunak yang mampu memimpin tim teknis, terutama pada sistem "
        "yang menuntut keandalan tinggi. Terima kasih banyak atas kesempatan "
        "wawancara ini.",
    ),
]

TAIL_SILENCE = 25  # jeda penutup agar berkas tidak habis saat AI menutup sesi


def run(*args: str) -> None:
    subprocess.run(args, check=True, capture_output=True)


def synth(text: str, work: Path, idx: int) -> bytes:
    """say -> AIFF -> afconvert -> WAV mono 16-bit @RATE -> frame PCM."""
    aiff = work / f"raw{idx}.aiff"
    wav = work / f"ans{idx}.wav"
    run("say", "-v", VOICE, "-o", str(aiff), text)
    run(
        "afconvert",
        "-f", "WAVE",
        "-d", f"LEI16@{RATE}",
        "-c", "1",
        str(aiff),
        str(wav),
    )
    with wave.open(str(wav), "rb") as w:
        assert w.getframerate() == RATE, w.getframerate()
        assert w.getnchannels() == 1
        assert w.getsampwidth() == 2
        return w.readframes(w.getnframes())


def room_tone(seconds: float) -> bytes:
    """Jeda dengan derau sangat pelan (~-55 dBFS), bukan keheningan digital.

    Keheningan absolut memicu automatic gain control peramban menaikkan
    penguatan hingga maksimum, sehingga saat ucapan masuk sinyalnya justru
    tergencet dan rasio sinyal-ke-derau yang diterima Gemini hancur. Derau
    ruangan tipis membuat AGC tetap pada penguatan wajar.
    """
    n = int(RATE * seconds)
    amp = 60  # ~-55 dBFS
    return array.array("h", (random.randint(-amp, amp) for _ in range(n))).tobytes()


def normalize(pcm: bytes, target_peak: int = 23000) -> bytes:
    """Naikkan level ucapan hasil TTS agar mendekati level bicara nyata."""
    samples = array.array("h")
    samples.frombytes(pcm)
    peak = max(max(samples), -min(samples)) if samples else 0
    if peak == 0:
        return pcm
    gain = target_peak / peak
    if gain <= 1.0:
        return pcm
    for i, s in enumerate(samples):
        samples[i] = max(-32768, min(32767, int(s * gain)))
    return samples.tobytes()


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        pcm = bytearray()
        for i, (gap, text) in enumerate(SCRIPT):
            pcm += room_tone(gap)
            pcm += normalize(synth(text, work, i))
        pcm += room_tone(TAIL_SILENCE)

    with wave.open(str(OUT), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(bytes(pcm))

    total = len(pcm) / 2 / RATE
    print(f"OK -> {OUT} ({total:.1f} detik)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
