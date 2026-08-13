"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface CustomerDetail {
  id: string;
  name: string;
  email: string | null;
  status: string;
  metadata: object | null;
  phone_number_id: string | null;
  phone_number: string | null;
  wa_account_status: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SetupLink {
  id: string;
  status: string;
  setup_url?: string;
  token_last4?: string;
  expires_at?: string;
  created_at: string;
  consumed_at?: string;
}

export default function CustomerDetailClient({
  customerId,
  hideBackLink,
}: {
  customerId: string;
  hideBackLink?: boolean;
}) {
  const id = customerId;
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [links, setLinks] = useState<SetupLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [lastSetupUrl, setLastSetupUrl] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Edit Phone Modal / Form
  const [editingPhone, setEditingPhone] = useState(false);
  const [inputPhone, setInputPhone] = useState("");
  const [inputPhoneId, setInputPhoneId] = useState("");
  const [updatingPhone, setUpdatingPhone] = useState(false);

  // Send message test
  const [sendTo, setSendTo] = useState("");
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomer();
    fetchLinks();
  }, []);

  const fetchCustomer = async () => {
    try {
      const res = await fetch(`/api/customers/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      setCustomer(data.data);
      setInputPhone(data.data.phone_number || "");
      setInputPhoneId(data.data.phone_number_id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  };

  const fetchLinks = async () => {
    try {
      const res = await fetch(`/api/customers/${id}/setup-link`);
      if (res.ok) {
        const data = await res.json();
        setLinks(Array.isArray(data.data) ? data.data : data.data?.data || []);
      }
    } catch {
      // Ignore
    }
  };

  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingPhone(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: inputPhone.trim(),
          phone_number_id: inputPhoneId.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to update phone number");
      setCustomer(data.data);
      setEditingPhone(false);
      alert("Nomor WhatsApp berhasil diperbarui!");
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to update phone number",
      );
    } finally {
      setUpdatingPhone(false);
    }
  };

  const generateSetupLink = async () => {
    setGeneratingLink(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${id}/setup-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to generate setup link");
      setLastSetupUrl(data.data.setup_url);
      fetchLinks();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to generate setup link";
      alert(msg);
      setError(msg);
    } finally {
      setGeneratingLink(false);
    }
  };

  const archiveCustomer = async () => {
    if (!confirm(`Archive customer ${customer?.name}?`)) return;
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to archive");
      router.push("/dashboard/customers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive");
    }
  };

  const sendMessage = async () => {
    if (!sendTo || !sendText) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: id,
          to: sendTo,
          type: "text",
          text: { body: sendText },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSendResult(`✅ Sent: ${data.data?.data?.id || "OK"}`);
      setSendTo("");
      setSendText("");
    } catch (err) {
      setSendResult(
        `❌ ${err instanceof Error ? err.message : "Failed to send"}`,
      );
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="text-zinc-500">Loading...</div>;
  }

  if (error || !customer) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error || "Customer not found"}</p>
        <Link
          href="/dashboard/customers"
          className="text-white hover:underline"
        >
          Back to customers
        </Link>
      </div>
    );
  }

  const isMetaConnected = Boolean(
    customer.phone_number_id &&
    (customer.wa_account_status === "connected" ||
      customer.status === "active"),
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        {!hideBackLink && (
          <Link
            href="/dashboard/customers"
            className="text-zinc-400 hover:text-white text-xs mb-3 inline-block font-semibold"
          >
            ← Kembali ke Daftar Tenant
          </Link>
        )}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {customer.name}
            </h1>
            <p className="text-zinc-400 text-xs mt-0.5">
              {customer.email || "Tidak ada email"} • ID:{" "}
              <span className="font-mono text-zinc-300">{customer.id}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/bot"
              className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-xl hover:bg-blue-500/30 transition font-semibold"
            >
              🤖 Setting Bot
            </Link>
            <Link
              href="/dashboard/leads"
              className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-3 py-1.5 rounded-xl hover:bg-purple-500/30 transition font-semibold"
            >
              📊 Leads
            </Link>
          </div>
        </div>
      </div>

      {/* WhatsApp status & Edit Phone Form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white text-base flex items-center gap-2">
            <span>📱</span> WhatsApp Business Connection
          </h2>
          <button
            onClick={() => setEditingPhone(!editingPhone)}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl transition"
          >
            {editingPhone ? "Batal" : "✏️ Update Nomor WA"}
          </button>
        </div>

        {editingPhone ? (
          <form
            onSubmit={handleUpdatePhone}
            className="space-y-4 bg-zinc-950/60 p-4 border border-zinc-800 rounded-xl"
          >
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Nomor WhatsApp Bisnis
              </label>
              <input
                type="text"
                placeholder="+6281234567890"
                value={inputPhone}
                onChange={(e) => setInputPhone(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Phone Number ID Meta (Opsional)
              </label>
              <input
                type="text"
                placeholder="100928374..."
                value={inputPhoneId}
                onChange={(e) => setInputPhoneId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={updatingPhone}
              className="bg-emerald-500 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs hover:bg-emerald-400 transition disabled:opacity-50"
            >
              {updatingPhone ? "Menyimpan..." : "Simpan Perubahan Nomor"}
            </button>
          </form>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400">Nomor WhatsApp</span>
              <span className="font-semibold text-emerald-400 font-mono">
                {customer.phone_number || "Belum terisi"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400">Phone Number ID Meta</span>
              <span className="font-mono text-zinc-300">
                {customer.phone_number_id || "-"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400">Status Koneksi</span>
              <span
                className={`font-semibold capitalize ${isMetaConnected ? "text-emerald-400" : "text-amber-400"}`}
              >
                {isMetaConnected
                  ? "Connected (Meta Verified) 🟢"
                  : "Belum Konek Meta (Embedded Signup Required) ⚠️"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Options & Setup Links Accordion */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="w-full p-5 flex items-center justify-between text-left hover:bg-zinc-800/40 transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="font-bold text-white text-sm">
                Opsi Lanjutan & Setup Links (Meta Signup)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {showAdvanced
                  ? "Klik untuk menyembunyikan opsi pendaftaran ulang / generate token baru"
                  : "Opsi pendaftaran ulang / generate setup link WABA baru (Hanya untuk rekoneksi)"}
              </p>
            </div>
          </div>
          <span className="text-zinc-400 hover:text-white text-xs font-semibold bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-xl transition">
            {showAdvanced ? "▲ Sembunyikan" : "▼ Tampilkan Setup Link"}
          </span>
        </button>

        {showAdvanced && (
          <div className="p-6 border-t border-zinc-800 bg-zinc-950/40 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-sm">
                  Setup Links (Embedded Signup)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Link pendaftaran langsung Meta Embedded Signup untuk mengkoneksikan WABA baru
                </p>
              </div>
              <button
                onClick={generateSetupLink}
                disabled={generatingLink}
                className="text-xs bg-white text-zinc-950 font-bold px-3 py-1.5 rounded-xl hover:bg-zinc-100 transition disabled:opacity-50"
              >
                {generatingLink ? "..." : "+ Generate Link"}
              </button>
            </div>

            {lastSetupUrl && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                <div className="text-xs text-emerald-400 font-bold mb-2">
                  ✅ Setup link berhasil dibuat (disalin sekarang):
                </div>
                <div className="flex gap-2">
                  <input
                    value={lastSetupUrl}
                    readOnly
                    className="flex-1 bg-zinc-950 rounded-xl px-3 py-2 text-xs font-mono text-white border border-zinc-800"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lastSetupUrl);
                      alert("Copied link!");
                    }}
                    className="bg-emerald-500 text-zinc-950 font-bold px-3 py-2 rounded-xl text-xs hover:bg-emerald-400 transition"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            {links.length === 0 ? (
              <p className="text-xs text-zinc-500 py-2">
                Belum ada setup link aktif.
              </p>
            ) : (
              <div className="space-y-2">
                {links.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between bg-zinc-950/60 p-3 border border-zinc-800/80 rounded-xl text-xs"
                  >
                    <div>
                      <span className="font-mono text-zinc-300">
                        ID: {link.id}
                      </span>
                      <span className="text-zinc-500 ml-2">
                        Token: ...{link.token_last4}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          link.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {link.status}
                      </span>
                      {link.setup_url && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(link.setup_url!);
                            alert("Copied setup URL!");
                          }}
                          className="text-zinc-400 hover:text-white underline text-[11px]"
                        >
                          Copy Link
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Outbound Test */}
      {/* <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h2 className="font-bold text-white text-base mb-1">Uji Coba Kirim Pesan Outbound</h2>
        <p className="text-xs text-zinc-400 mb-4">Kirim pesan WhatsApp langsung untuk mengetes integrasi KirimDev SDK</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Nomor WA Tujuan (E.164 format, misal +628123456789)</label>
            <input
              type="text"
              placeholder="+628123456789"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Pesan Outbound</label>
            <textarea
              rows={2}
              placeholder="Halo dari Chatin!"
              value={sendText}
              onChange={(e) => setSendText(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={sending || !sendTo || !sendText}
            className="bg-emerald-500 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs hover:bg-emerald-400 transition disabled:opacity-50"
          >
            {sending ? 'Mengirim...' : 'Kirim Pesan Uji Coba'}
          </button>
          {sendResult && <div className="text-xs font-mono mt-2">{sendResult}</div>}
        </div>
      </div> */}

      {/* Danger Zone */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
        <h2 className="font-bold text-red-400 text-base mb-1">Danger Zone</h2>
        <p className="text-xs text-zinc-400 mb-4">
          Arsipkan customer ini jika sudah tidak aktif lagi
        </p>
        <button
          onClick={archiveCustomer}
          className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition"
        >
          Arsipkan Customer
        </button>
      </div>
    </div>
  );
}
