import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const $ = id => document.getElementById(id);
const show = (id,on=true) => $(id).classList.toggle('hidden',!on);
const notice = text => { $('notice').textContent=text;show('notice',!!text); };
const config = window.A55_CONFIG || {};
const ready = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) && (config.publishableKey?.startsWith('sb_publishable_') || config.publishableKey?.startsWith('eyJ'));
const token = new URLSearchParams(location.search).get('c');
if (!ready) { show('setup'); } else {
  window.db=createClient(config.supabaseUrl,config.publishableKey);  if (token) { show('customerView');loadCoupon(); } else { initStaff(); }
  async function initStaff(){
    const {data:{session}}=await db.auth.getSession();
    if(!session){show('login');return;}
    const {data:profiles,error}=await db.from('staff_profiles').select('role,active').eq('user_id',session.user.id).maybeSingle();
    if(error||!profiles?.active){show('login');notice('このアカウントには有効なスタッフ権限がありません。');await db.auth.signOut();return;}
    show('login',false);show('staff');$('who').textContent=`ログイン中：${session.user.email}（${profiles.role==='manager'?'店長':'スタッフ'}）`;
    await refresh();
  }
  $('signin').onclick=async()=>{notice('');const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){notice('ログインできませんでした。メールアドレス・パスワードを確認してください。');return;}await initStaff();};
  $('signout').onclick=async()=>{await db.auth.signOut();location.reload();};
  $('issue').onclick=async()=>{
    notice('');const amount=Number($('amount').value);if(!Number.isSafeInteger(amount)||amount<=0){notice('金額は1円以上の整数で入力してください。');return;}
    const title=$('title').value.trim();if(!title){notice('クーポン名を入力してください。');return;}
    const {data:{user}}=await db.auth.getUser();if(!user){notice('再ログインしてください。');return;}
    const expiry=$('expiry').value;const payload={title,amount,customer_name:$('customer').value.trim()||null,description:$('description').value.trim()||null,conditions:$('conditions').value.trim()||null,notes:$('notes').value.trim()||null,expires_at:expiry?new Date(expiry).toISOString():null,created_by:user.id,token:'auto-generated',status:'unused'};
    $('issue').disabled=true;
    const {data,error}=await db.from('coupons').insert(payload).select('id,token').single();
    $('issue').disabled=false;
    if(error){notice('発行に失敗しました。設定や権限を確認してください。詳細：'+error.message);return;}
    const url=new URL(location.href);url.search='';url.searchParams.set('c',data.token);
    $('issued').textContent='発行しました。お客様用URL：\n'+url.toString();show('issued');await refresh();
    $('copyUrl').hidden=false;$('copyUrl').onclick=async()=>{try{await navigator.clipboard.writeText(url.toString());alert('URLをコピーしました！');}catch(e){prompt('このURLをコピーしてください',url.toString());}};
  };
  $('refresh').onclick=refresh;

  async function refresh(){
    const {data,error}=await db.from('coupons')
      .select('id,title,amount,status,created_at,customer_name,token')
      .order('created_at',{ascending:false}).limit(20);
  
    if(error){
      $('history').textContent='履歴の取得に失敗しました';
      return;
    }
  
    const history=$('history');
    history.replaceChildren();
  
    for(const c of data||[]){
      const row=document.createElement('div');
      row.style.marginBottom='12px';
  
      const info=document.createElement('span');
      info.textContent=`${new Date(c.created_at).toLocaleString('ja-JP')}　${c.title}　${Number(c.amount).toLocaleString()}円　${c.status}　${c.customer_name||''}　`;
      row.appendChild(info);
  
      if(c.token){
        const button=document.createElement('button');
        button.textContent='📋 URLコピー';
        button.className='secondary';
        button.onclick=async()=>{
          const url=new URL(location.origin+location.pathname);
          url.searchParams.set('c',c.token);
          try{
            await navigator.clipboard.writeText(url.toString());
            alert('URLをコピーしました');
          }catch(e){
            prompt('このURLをコピーしてください',url.toString());
          }
        };
        row.appendChild(button);
      }
  
      history.appendChild(row);
    }
  
    if(!data?.length){
      history.textContent='発行履歴はまだありません。';
    }
  }
}
async function loadCoupon(){
      $('redeem').disabled=true;
    const {data,error}=await db.rpc('get_coupon_by_token',{p_token:token});const c=Array.isArray(data)?data[0]:data;
    if(error||!c){$('couponStatus').textContent='クーポンが見つかりません。';return;}
    $('couponTitle').textContent=c.title;$('couponAmount').textContent=`¥${Number(c.amount).toLocaleString('ja-JP')} 割引`;
    $('couponName').textContent=c.customer_name?`お客様：${c.customer_name} 様`:'';
    $('couponDescription').textContent=c.description||'';$('couponConditions').textContent=c.conditions?`利用条件：${c.conditions}`:'';$('couponNotes').textContent=c.notes?`備考：${c.notes}`:'';
    $('couponExpiry').textContent=c.expires_at?`有効期限：${new Date(c.expires_at).toLocaleString('ja-JP')}`:'有効期限：設定なし';
    $('couponStatus').textContent=({unused:'未使用',used:'使用済み',revoked:'取り消し済み',expired:'期限切れ'})[c.status]||c.status;
    $('redeem').disabled=c.status!=='unused';
  }
  $('redeem').onclick=async()=>{
    if(!confirm('このクーポンを使用済みにします。元に戻せません。よろしいですか？'))return;
    $('redeem').disabled=true;const {data,error}=await db.rpc('redeem_coupon',{p_token:token});
    if(error){$('couponStatus').textContent='通信エラーが発生しました。再読み込みして状態を確認してください。';return;}
    $('couponStatus').textContent=data?.success?'使用済みになりました。ありがとうございました！':'使用できません。使用済み・期限切れ・取り消し済みの可能性があります。';
    await loadCoupon();
  };

  db.auth.onAuthStateChange(async (event) => {  if (event === 'PASSWORD_RECOVERY') {
    const newPassword = prompt('新しいパスワードを入力してください');
    if (!newPassword) return;
    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) {
      alert('パスワードの変更に失敗しました: ' + error.message);
    } else {
      alert('パスワードを変更しました。新しいパスワードでログインしてください。');
    }
  }
});