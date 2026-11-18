import json,sys,urllib.request,time,collections
def varint(b,i):
    v=b[i]
    if v<0xfd: return v,i+1
    if v==0xfd: return int.from_bytes(b[i+1:i+3],'little'),i+3
    if v==0xfe: return int.from_bytes(b[i+1:i+5],'little'),i+5
    return int.from_bytes(b[i+1:i+9],'little'),i+9
def parse_tx(b,i):
    start=i; i+=4; n,i=varint(b,i); ins=[]
    for _ in range(n):
        i+=36; l,i=varint(b,i); ss=b[i:i+l]; i+=l+4; ins.append(ss)
    n,i=varint(b,i)
    for _ in range(n):
        i+=8; l,i=varint(b,i); i+=l
    i+=4; return ins,i
def first_push(ss):
    if not ss: return None
    op=ss[0]
    if 1<=op<=75: return ss[1:1+op], 1+op
    return None,None
H=int(sys.argv[1]); N=int(sys.argv[2])
c=collections.Counter(); txc=collections.Counter(); tot_tx=0
for h in range(H-N+1,H+1):
    for a in range(3):
        try:
            d=json.load(urllib.request.urlopen(f"https://api.blockchair.com/bitcoin-cash/raw/block/{h}",timeout=40)); break
        except Exception as e: time.sleep(5)
    raw=bytes.fromhex(list(d['data'].values())[0]['raw_block'])
    i=80; n,i=varint(raw,i)
    for t in range(n):
        ins,i=parse_tx(raw,i)
        if t==0: continue
        tot_tx+=1; kinds=set()
        for ss in ins:
            p=first_push(ss)
            if not p or p[0] is None: c['non-push/contract']+=1; kinds.add('contract'); continue
            sig,j=p
            # P2PKH scriptSig = <sig 65|71-73> <pubkey 33|65>, exactly two pushes
            rest=ss[j:]
            is_p2pkh = (len(sig)==65 or (9<=len(sig)<=73 and sig[0]==0x30)) and len(rest) in (34,66) and rest[0] in (33,65)
            if not is_p2pkh: c['other-script']+=1; kinds.add('contract'); continue
            ht=sig[-1]; c[hex(ht)]+=1; kinds.add('utxos' if ht&0x20 else ('acp' if ht&0x80 else ('all' if ht&0x1f==1 else 'other')))
        if 'contract' in kinds: txc['has non-P2PKH input']+=1
        elif 'utxos' in kinds: txc['P2PKH-only but SIGHASH_UTXOS']+=1
        elif 'acp' in kinds or 'other' in kinds: txc['P2PKH weak sighash']+=1
        else: txc['P2PKH ALL (DSProof-coverable)']+=1
    time.sleep(2.2)
print('blocks',H-N+1,'..',H,'non-coinbase txs',tot_tx)
print('inputs by sighash:',dict(c.most_common()))
for k,v in txc.most_common(): print(f'  {k}: {v} ({100*v/tot_tx:.1f}%)')
