import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserAccounts, validateSecurityCode, getUserSecurityCodes } from '@/services/api';
import { supabase } from '@/db/supabase';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Account, SecurityCodeType } from '@/types/types';
import { ArrowLeftRight, Users, Building2, Hash, MapPin, FileText, CheckCircle2, Download, Printer, X, ShieldCheck, AlertCircle } from 'lucide-react';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
function genRef() {
  return 'TXN' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

async function parseEdgeError(error: { context?: { text?: () => Promise<string> }; message?: string }): Promise<string> {
  try {
    const raw = await error?.context?.text?.();
    if (!raw) return error?.message || 'Unknown error';
    const parsed = JSON.parse(raw);
    return parsed.error || parsed.message || raw;
  } catch {
    return error?.message || 'Unknown error';
  }
}

interface ReceiptData {
  ref: string; date: string; fromAccount: string; fromAccountNumber: string;
  recipientAccount: string; bankName: string; routingNumber: string;
  swiftCode: string; bankAddress: string; purpose: string; memo: string; amount: number;
}

const purposeLabel: Record<string, string> = {
  personal: 'Personal / Family Support', business: 'Business Payment',
  investment: 'Investment', real_estate: 'Real Estate',
  education: 'Education', medical: 'Medical Expenses', other: 'Other',
};

const RECEIPT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111; padding: 40px; }
  .header { text-align: center; border-bottom: 2px solid #0d3b6e; padding-bottom: 20px; margin-bottom: 24px; }
  .logo { font-size: 22px; font-weight: 700; color: #0d3b6e; }
  .tagline { font-size: 11px; color: #666; margin-top: 2px; }
  .title { font-size: 16px; font-weight: 600; margin-top: 12px; color: #0d3b6e; }
  .status { display:inline-block; background:#d1fae5; color:#065f46; font-size:12px; font-weight:700; padding:3px 12px; border-radius:20px; margin-top:6px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#888; border-bottom:1px solid #eee; padding-bottom:4px; margin-bottom:10px; }
  .row { display:flex; justify-content:space-between; padding:4px 0; font-size:13px; }
  .key { color:#555; }
  .val { font-weight:600; color:#111; text-align:right; max-width:60%; word-break:break-word; }
  .amount-box { background:#f0f7ff; border:1px solid #bcd4f5; border-radius:8px; padding:16px; text-align:center; margin:20px 0; }
  .amount-label { font-size:11px; color:#666; text-transform:uppercase; letter-spacing:1px; }
  .amount-value { font-size:28px; font-weight:700; color:#0d3b6e; margin-top:4px; }
  .footer { text-align:center; font-size:10px; color:#aaa; border-top:1px solid #eee; padding-top:14px; margin-top:24px; }
`;

/* ── Receipt Modal ── */
function ReceiptModal({ receipt, onClose }: { receipt: ReceiptData; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  const getHtml = () => {
    const body = printRef.current?.innerHTML || '';
    return `<html><head><title>Receipt — ${receipt.ref}</title><style>${RECEIPT_STYLES}</style></head><body>${body}</body></html>`;
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(getHtml());
    win.document.close(); win.focus(); win.print(); win.close();
  };

  const handleDownload = () => {
    const blob = new Blob([getHtml()], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `NovaCrest-Receipt-${receipt.ref}.html`;
    a.click();
  };

  const rows = (items: [string, string, boolean?][]) => items.filter(([, v]) => v !== undefined ? v : !!v).map(([k, v, mono]) => (
    <div key={k} className="row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span className="key" style={{ color: '#555' }}>{k}</span>
      <span className="val" style={{ fontWeight: 600, color: k === 'Status' ? '#059669' : '#111', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word', fontFamily: mono ? 'monospace' : 'inherit' }}>{v}</span>
    </div>
  ));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl bg-card border-border p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 flex flex-row items-center justify-between">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Transfer Receipt
          </DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={handlePrint}><Printer className="h-3.5 w-3.5" /> Print</Button>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownload}><Download className="h-3.5 w-3.5" /> Download</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </DialogHeader>
        <Separator className="bg-border" />
        <div ref={printRef} className="overflow-y-auto max-h-[65vh] px-6 py-5 space-y-4">
          <div className="header" style={{ textAlign: 'center', borderBottom: '2px solid #0d3b6e', paddingBottom: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0d3b6e', fontFamily: 'Space Grotesk, sans-serif' }}>NovaCrest Bank</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Wire Transfer Confirmation</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8, color: '#0d3b6e' }}>Official Transfer Receipt</div>
            <span style={{ display: 'inline-block', background: '#d1fae5', color: '#065f46', fontSize: 11, fontWeight: 700, padding: '2px 12px', borderRadius: 20, marginTop: 6 }}>✓ SUCCESSFULLY PROCESSED</span>
          </div>
          <div style={{ background: '#f0f7ff', border: '1px solid #bcd4f5', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Amount Transferred</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#0d3b6e', marginTop: 4 }}>{fmt(receipt.amount)}</div>
          </div>
          <div className="section">
            <div className="section-title" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#888', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 8 }}>Transaction Details</div>
            {rows([['Reference Number', receipt.ref], ['Date & Time', receipt.date], ['Status', 'Completed'], ['Transfer Type', 'External Wire Transfer']])}
          </div>
          <div className="section">
            <div className="section-title" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#888', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 8 }}>Sender</div>
            {rows([['Account Name', receipt.fromAccount], ['Account Number', receipt.fromAccountNumber, true], ['Bank', 'NovaCrest Bank']])}
          </div>
          <div className="section">
            <div className="section-title" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#888', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 8 }}>Recipient</div>
            {rows([
              ['Account Number', receipt.recipientAccount, true],
              ...(receipt.bankName ? [['Bank Name', receipt.bankName] as [string, string]] : []),
              ...(receipt.routingNumber ? [['Routing Number (ABA)', receipt.routingNumber, true] as [string, string, boolean]] : []),
              ...(receipt.swiftCode ? [['SWIFT / BIC', receipt.swiftCode, true] as [string, string, boolean]] : []),
              ...(receipt.bankAddress ? [['Bank Address', receipt.bankAddress] as [string, string]] : []),
              ...(receipt.purpose ? [['Transfer Purpose', purposeLabel[receipt.purpose] || receipt.purpose] as [string, string]] : []),
              ...(receipt.memo ? [['Memo / Reference', receipt.memo] as [string, string]] : []),
            ])}
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: '#aaa', borderTop: '1px solid #eee', paddingTop: 12 }}>
            This receipt is generated by NovaCrest Bank and serves as confirmation of your transfer.<br />
            For inquiries: support@novacrestbk.online
          </div>
        </div>
        <Separator className="bg-border" />
        <div className="px-6 py-4 flex justify-end"><Button onClick={onClose} variant="outline" size="sm">Close</Button></div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Code Verification Modal ── */
type CodeStep = { type: SecurityCodeType; label: string; entered: string; verified: boolean };

function CodeVerifyModal({
  userId, requiredCodes, onVerified, onCancel
}: {
  userId: string;
  requiredCodes: SecurityCodeType[];
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [steps, setSteps] = useState<CodeStep[]>(
    requiredCodes.map(t => ({ type: t, label: t, entered: '', verified: false }))
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const current = steps[activeIdx];

  const verify = async () => {
    if (!current.entered.trim()) { setError('Please enter the code'); return; }
    setChecking(true); setError('');
    const result = await validateSecurityCode(userId, current.type, current.entered.trim());
    setChecking(false);
    if (!result.valid) { setError(result.error || 'Invalid code'); return; }

    const updated = steps.map((s, i) => i === activeIdx ? { ...s, verified: true } : s);
    setSteps(updated);
    if (activeIdx < steps.length - 1) {
      setActiveIdx(activeIdx + 1);
    } else {
      onVerified();
    }
  };

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" /> Security Verification
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Step indicators */}
          {steps.length > 1 && (
            <div className="flex items-center gap-2">
              {steps.map((s, i) => (
                <div key={s.type} className={`flex-1 h-1 rounded-full transition-colors ${s.verified ? 'bg-emerald-400' : i === activeIdx ? 'bg-primary' : 'bg-muted'}`} />
              ))}
            </div>
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Enter your <span className="text-primary font-bold">{current.type}</span> Code
              {steps.length > 1 && <span className="text-muted-foreground text-xs"> ({activeIdx + 1}/{steps.length})</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {current.type === 'PIN' && 'Enter your 4–6 digit transaction PIN'}
              {current.type === 'IMF' && 'Enter your IMF (International Monetary Fund) verification code issued by the bank'}
              {current.type === 'COT' && 'Enter your COT (Cost of Transfer) clearance code issued by the bank'}
              {current.type === 'TAC' && 'Enter your TAC (Transaction Authorization Code) issued by the bank'}
            </p>
          </div>
          <Input
            type="text"
            placeholder={`${current.type} code`}
            value={current.entered}
            onChange={e => {
              setError('');
              setSteps(steps.map((s, i) => i === activeIdx ? { ...s, entered: e.target.value } : s));
            }}
            onKeyDown={e => e.key === 'Enter' && verify()}
            className="px-3 font-mono tracking-widest text-center text-lg"
            autoFocus
          />
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={checking}>Cancel</Button>
            <Button className="flex-1" onClick={verify} disabled={checking}>
              {checking ? 'Verifying…' : activeIdx < steps.length - 1 ? 'Next →' : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main Page ── */
export default function TransferPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<(() => Promise<void>) | null>(null);
  const [requiredCodes, setRequiredCodes] = useState<SecurityCodeType[]>([]);
  const [showCodeModal, setShowCodeModal] = useState(false);

  // Internal transfer
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [intAmount, setIntAmount] = useState('');
  const [intMemo, setIntMemo] = useState('');

  // External transfer
  const [extFromId, setExtFromId] = useState('');
  const [recipientAcctNum, setRecipientAcctNum] = useState('');
  const [extAmount, setExtAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [swiftCode, setSwiftCode] = useState('');
  const [bankAddress, setBankAddress] = useState('');
  const [transferPurpose, setTransferPurpose] = useState('');
  const [extMemo, setExtMemo] = useState('');

  const reloadAccounts = () => { if (user) getUserAccounts(user.id).then(setAccounts); };
  useEffect(() => { reloadAccounts(); }, [user]);

  const doInternalTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(intAmount);
    if (!fromId || !toId || isNaN(amount) || amount <= 0) { toast.error('Please fill all fields correctly'); return; }
    if (fromId === toId) { toast.error('Source and destination must be different'); return; }
    const fromAcct = accounts.find(a => a.id === fromId);
    if (!fromAcct || fromAcct.available_balance < amount) { toast.error('Insufficient funds'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('banking-ops', {
        body: { action: 'internal_transfer', from_account_id: fromId, to_account_id: toId, amount, user_id: user!.id, memo: intMemo }
      });
      if (error) throw new Error(await parseEdgeError(error));
      toast.success(`${fmt(amount)} transferred successfully`);
      setIntAmount(''); setFromId(''); setToId(''); setIntMemo('');
      reloadAccounts();
    } catch (err: unknown) {
      toast.error('Transfer failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally { setLoading(false); }
  };

  // Check if user has any pending security codes assigned — if so, require them
  const checkRequiredCodes = async (): Promise<SecurityCodeType[]> => {
    const codes = await getUserSecurityCodes(user!.id);
    const pending = codes.filter(c => !c.is_used && (!c.expires_at || new Date(c.expires_at) > new Date()));
    const types = [...new Set(pending.map(c => c.code_type))] as SecurityCodeType[];
    return types;
  };

  const executeExternalTransfer = async (
    fromAcct: Account, amount: number
  ) => {
    setLoading(true);
    await new Promise(res => setTimeout(res, 1500));
    try {
      const ref = genRef();
      const desc = [
        `External Wire Transfer → ${recipientAcctNum.trim()}`,
        bankName && `Bank: ${bankName}`,
        routingNumber && `Routing: ${routingNumber}`,
        swiftCode && `SWIFT: ${swiftCode}`,
        transferPurpose && `Purpose: ${purposeLabel[transferPurpose] || transferPurpose}`,
        extMemo && `Memo: ${extMemo}`,
      ].filter(Boolean).join(' | ');

      // Insert transaction record with correct columns
      const { error: txErr } = await supabase.from('transactions').insert({
        from_account_id: fromAcct.id,
        user_id: user!.id,
        transaction_type: 'transfer_out',
        amount: Math.abs(amount),
        description: desc,
        status: 'completed',
        reference_number: ref,
      });
      if (txErr) throw new Error(txErr.message);

      // Deduct from sender's balance
      await supabase.from('accounts').update({
        balance: fromAcct.balance - amount,
        available_balance: fromAcct.available_balance - amount,
      }).eq('id', fromAcct.id);

      setReceipt({
        ref,
        date: new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'medium' }),
        fromAccount: fromAcct.account_type.charAt(0).toUpperCase() + fromAcct.account_type.slice(1) + ' Account',
        fromAccountNumber: fromAcct.account_number,
        recipientAccount: recipientAcctNum.trim(),
        bankName, routingNumber, swiftCode, bankAddress,
        purpose: transferPurpose, memo: extMemo, amount,
      });
      toast.success(`${fmt(amount)} transferred successfully!`);

      // Reset form
      setExtAmount(''); setExtFromId(''); setRecipientAcctNum('');
      setBankName(''); setRoutingNumber(''); setSwiftCode('');
      setBankAddress(''); setTransferPurpose(''); setExtMemo('');
      reloadAccounts();
    } catch (err) {
      toast.error('Transfer error: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally { setLoading(false); }
  };

  const doExternalTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(extAmount);
    if (!extFromId || !recipientAcctNum.trim() || isNaN(amount) || amount <= 0) {
      toast.error('Please fill all required fields'); return;
    }
    const fromAcct = accounts.find(a => a.id === extFromId);
    if (!fromAcct) { toast.error('Please select a source account'); return; }
    if (fromAcct.available_balance < amount) { toast.error('Insufficient available balance'); return; }

    // Check if security codes are required
    const required = await checkRequiredCodes();
    if (required.length > 0) {
      setRequiredCodes(required);
      setPendingTransfer(() => () => executeExternalTransfer(fromAcct, amount));
      setShowCodeModal(true);
    } else {
      await executeExternalTransfer(fromAcct, amount);
    }
  };

  const handleCodesVerified = async () => {
    setShowCodeModal(false);
    if (pendingTransfer) {
      await pendingTransfer();
      setPendingTransfer(null);
    }
  };

  const accountOptions = accounts.map(a => (
    <SelectItem key={a.id} value={a.id}>
      {a.account_type.charAt(0).toUpperCase() + a.account_type.slice(1)} — {a.account_number} ({fmt(a.available_balance)})
    </SelectItem>
  ));

  return (
    <DashboardLayout>
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
      {showCodeModal && (
        <CodeVerifyModal
          userId={user!.id}
          requiredCodes={requiredCodes}
          onVerified={handleCodesVerified}
          onCancel={() => { setShowCodeModal(false); setPendingTransfer(null); }}
        />
      )}

      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Transfer Funds</h1>
          <p className="text-muted-foreground text-sm mt-1">Move money between your accounts or send externally</p>
        </div>

        <Tabs defaultValue="internal">
          <TabsList className="w-full max-w-sm">
            <TabsTrigger value="internal" className="flex-1"><ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />My Accounts</TabsTrigger>
            <TabsTrigger value="external" className="flex-1"><Users className="h-3.5 w-3.5 mr-1.5" />External Wire</TabsTrigger>
          </TabsList>

          {/* ── INTERNAL TRANSFER ── */}
          <TabsContent value="internal">
            <Card className="max-w-lg bg-card border-border mt-4">
              <CardHeader>
                <CardTitle>Internal Transfer</CardTitle>
                <CardDescription>Transfer instantly between your own NovaCrest accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={doInternalTransfer} className="space-y-4">
                  <div className="space-y-2">
                    <Label>From Account</Label>
                    <Select value={fromId} onValueChange={setFromId}>
                      <SelectTrigger><SelectValue placeholder="Select source account" /></SelectTrigger>
                      <SelectContent>{accountOptions}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>To Account</Label>
                    <Select value={toId} onValueChange={setToId}>
                      <SelectTrigger><SelectValue placeholder="Select destination account" /></SelectTrigger>
                      <SelectContent>{accountOptions}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (USD)</Label>
                    <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={intAmount}
                      onChange={e => setIntAmount(e.target.value)} className="px-3" />
                  </div>
                  <div className="space-y-2">
                    <Label>Memo <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input placeholder="e.g. Savings top-up" value={intMemo}
                      onChange={e => setIntMemo(e.target.value)} className="px-3" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Processing…' : 'Transfer Funds'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── EXTERNAL TRANSFER ── */}
          <TabsContent value="external">
            <Card className="max-w-2xl bg-card border-border mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  External Wire Transfer
                  <Badge className="text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/25">Instant Processing</Badge>
                </CardTitle>
                <CardDescription>Send funds to any bank account. Fields marked * are required.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={doExternalTransfer} className="space-y-5">
                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transfer Details</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>From Account <span className="text-destructive">*</span></Label>
                        <Select value={extFromId} onValueChange={setExtFromId}>
                          <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                          <SelectContent>{accountOptions}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Amount (USD) <span className="text-destructive">*</span></Label>
                        <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={extAmount}
                          onChange={e => setExtAmount(e.target.value)} className="px-3" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Recipient Account Number <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="e.g. CHK-1234567890" value={recipientAcctNum}
                          onChange={e => setRecipientAcctNum(e.target.value)} className="pl-9 px-9 font-mono" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Transfer Purpose</Label>
                      <Select value={transferPurpose} onValueChange={setTransferPurpose}>
                        <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">Personal / Family Support</SelectItem>
                          <SelectItem value="business">Business Payment</SelectItem>
                          <SelectItem value="investment">Investment</SelectItem>
                          <SelectItem value="real_estate">Real Estate</SelectItem>
                          <SelectItem value="education">Education</SelectItem>
                          <SelectItem value="medical">Medical Expenses</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator className="bg-border" />

                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recipient Bank Information</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Bank Name</Label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="e.g. Chase Bank" value={bankName}
                            onChange={e => setBankName(e.target.value)} className="pl-9 px-9" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Routing Number (ABA)</Label>
                        <div className="relative">
                          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="e.g. 021000021" value={routingNumber}
                            onChange={e => setRoutingNumber(e.target.value)} className="pl-9 px-9 font-mono" maxLength={9} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>SWIFT / BIC Code</Label>
                        <div className="relative">
                          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="e.g. CHASUS33XXX" value={swiftCode}
                            onChange={e => setSwiftCode(e.target.value.toUpperCase())} className="pl-9 px-9 font-mono" maxLength={11} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Bank Address</Label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="e.g. 270 Park Ave, New York, NY" value={bankAddress}
                            onChange={e => setBankAddress(e.target.value)} className="pl-9 px-9" />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Memo / Payment Reference</Label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="e.g. Invoice #1234" value={extMemo}
                          onChange={e => setExtMemo(e.target.value)} className="pl-9 px-9" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      Transfers are processed instantly. Security codes (PIN/IMF/COT/TAC) may be required if assigned to your account.
                      A receipt will be generated upon completion.
                    </p>
                  </div>

                  <Button type="submit" className="w-full gap-2" disabled={loading}>
                    {loading ? (
                      <><span className="h-4 w-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" /> Processing Transfer…</>
                    ) : (
                      <><ArrowLeftRight className="h-4 w-4" /> Send Transfer</>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
