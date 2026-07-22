const count = (progress, target, start, end) => Math.round(lerp(0, target, easeInOutCubic(clamp((progress - start) / (end - start)))));
const entrance = (progress, index) => { const t = easeOutCubic(clamp((progress - .05 - index * .05) / .24)); return { opacity:t, transform:`translateY(${lerp(26, 0, t)}px)` }; };
const tint = (hex, opacity) => `${hex}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
const onAccent = () => '#000';

function Phone({ children, accent, progress }) {
  return <div className="phone" style={{ transform:`scale(${lerp(1, 1.05, progress)})` }}>
    {children}
    <div className="tabs"><span style={{color:accent}}>⌂<br/>Home</span><span>▦<br/>Calendar</span><span className="fab" style={{background:accent,color:onAccent(accent)}}>＋</span><span>▥<br/>Analytics</span><span>♛<br/>Rank</span></div>
  </div>;
}

function Today({ progress, accent }) {
  const bar = easeInOutCubic(clamp((progress - .25) / .47));
  const hero = easeOutBack(clamp((progress - .1) / .35));
  return <Phone accent={accent} progress={progress}><div className="phone-content">
    <div style={entrance(progress, 0)} className="muted">Chào, Minh</div>
    <div style={entrance(progress, 1)}><div className="card" style={{display:'flex',alignItems:'center',gap:14,transform:`scale(${lerp(.94, 1, hero)})`}}><span style={{fontSize:42,color:'#E0A93B'}}>★</span><div><strong style={{fontSize:42,letterSpacing:'-.08em'}}>{count(progress, 7, .12, .5)}</strong><div className="muted">sao của bạn</div></div></div></div>
    <div className="card" style={entrance(progress, 2)}><div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span>Điểm hôm nay</span><strong>{count(progress, 38, .25, .72)} / 50</strong></div><div style={{height:9,background:'#ffffff18',borderRadius:9,marginTop:10,overflow:'hidden'}}><div style={{height:'100%',width:`${76 * bar}%`,background:accent,borderRadius:9}} /></div></div>
    {['Running','Reading','Gym'].map((task, i) => <div className="row" key={task} style={entrance(progress, i + 5)}><span className="check" style={i < 2 ? {background:accent,borderColor:accent,color:onAccent(accent)} : {}}>{i < 2 ? '✓' : ''}</span>{task}</div>)}
  </div></Phone>;
}

function HeatMap({ progress, accent }) {
  const fill = easeInOutCubic(clamp((progress - .08) / .74));
  return <Phone accent={accent} progress={progress}><div className="phone-content"><div className="eyebrow" style={entrance(progress,0)}>PHÂN TÍCH · ANALYTICS</div><div className="stat" style={entrance(progress,1)}>{count(progress,128,.1,.72)}</div><div className="muted">ngày hoạt động</div><div className="grid">{Array.from({length:119}, (_,i) => { const col=i%17,row=Math.floor(i/17),wave=(col+row*.12)/17,visible=easeOutBack(clamp((fill-wave)*5)),level=1+Math.floor(Math.abs(Math.sin(i*12.9898))*4); return <i key={i} className="cell" style={{background:tint(accent,.12+level*.17),opacity:clamp(visible),transform:`scale(${clamp(visible)})`}} />; })}</div><div className="legend"><span>Ít · Less</span>{[1,2,3,4,5].map(n=><i key={n} style={{background:tint(accent,.12+n*.17)}} />)}<span>Nhiều · More</span></div></div></Phone>;
}

function Bars({ progress, accent }) {
  const values=[32,45,50,28,52,41,64], days=['T2','T3','T4','T5','T6','T7','CN'];
  return <Phone accent={accent} progress={progress}><div className="phone-content"><div className="eyebrow" style={entrance(progress,0)}>PHÂN TÍCH · TUẦN NÀY</div><div className="stat" style={entrance(progress,1)}>{count(progress,312,.08,.72)}</div><div className="muted">điểm tuần này</div><div className="chart"><div className="goal">Mục tiêu 50 · Goal</div>{values.map((value,i) => { const grown=easeOutCubic(clamp((progress-i*.06)/.4)),best=i===6; return <div className="bar-wrap" key={value}><strong style={{opacity:clamp((grown-.85)*7),color:best?'#E0A93B':'#dfe8e1'}}>{Math.round(value*grown)}</strong><div className="bar" style={{height:`${value/72*100*grown}%`,background:best?'#E0A93B':accent,boxShadow:best?'0 0 14px #E0A93B88':'none'}} /><span>{days[i]}</span></div>; })}</div></div></Phone>;
}

function Donut({ progress, accent }) {
  const reveal=easeInOutCubic(clamp((progress-.08)/.64)), r=42, c=2*Math.PI*r, parts=[['Sport',.34,accent],['Study',.27,'#d8ebe0'],['Reading',.22,'#E0A93B'],['Other',.17,'#536259']];
  let start=0;
  return <Phone accent={accent} progress={progress}><div className="phone-content"><div className="eyebrow" style={entrance(progress,0)}>THÓI QUEN · TOP HABITS</div><div className="donut-wrap"><svg viewBox="0 0 160 160">{parts.map(([name,value,color])=>{const drawn=clamp(reveal-start,0,value),offset=start*c;start+=value;return <circle key={name} cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="15" strokeLinecap="round" strokeDasharray={`${drawn*c} ${c}`} strokeDashoffset={-offset} />;})}</svg><div className="donut-center"><strong>{count(progress,356,.08,.72)}</strong><span className="muted">lượt · logs</span></div></div>{parts.map(([name,value,color],i)=><div className="legend-row" key={name} style={entrance(progress,i+1)}><span><i style={{display:'inline-block',width:9,height:9,borderRadius:3,background:color,marginRight:8}} />{name}</span><strong>{count(progress,value*100,.18+i*.04,.76)}%</strong></div>)}</div></Phone>;
}

function Closing({ progress, accent }) {
  const wash=easeInOutCubic(clamp(progress/.45)),ring=easeOutBack(clamp((progress-.1)/.4)),stroke=easeInOutCubic(clamp((progress-.15)/.47)),check=easeOutCubic(clamp((progress-.5)/.2)),C=2*Math.PI*49;
  return <section className="scene closing" style={{background:`rgb(${Math.round(lerp(15,245,wash))},${Math.round(lerp(20,246,wash))},${Math.round(lerp(16,245,wash))})`,color:wash>.5?'#18201b':'#fff'}}><div className="brand-ring" style={{transform:`scale(${lerp(.8,1,ring)})`,border:`1px solid ${tint(accent,.25)}`}}><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="49" fill="none" stroke={tint(accent,.2)} strokeWidth="9"/><circle cx="60" cy="60" r="49" fill="none" stroke={accent} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${C*.82} ${C}`} strokeDashoffset={C*.82*(1-stroke)} /><circle cx="60" cy="11" r="4" fill="#E0A93B"/><path d="M40 61 L53 74 L80 46" fill="none" stroke={accent} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" strokeDashoffset={60*(1-check)} /></svg></div><div className="wordmark" style={entrance(progress,9)}>habit <span style={{color:accent}}>ring</span></div><div className="muted" style={{...entrance(progress,13),color:wash>.5?'#667168':'#9aa69e'}}>daily completion, the loop</div></section>;
}

function PromoRoot() {
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(window.EDITMODE) || 'null') || window.TWEAK_DEFAULTS; } catch { return window.TWEAK_DEFAULTS; } }, []);
  const [accent,setAccent]=useState(saved.accent),[motionEditor,setMotionEditor]=useState(saved.motionEditor);
  useEffect(() => localStorage.setItem(window.EDITMODE, JSON.stringify({accent,motionEditor})), [accent,motionEditor]);
  return <SceneStage>{({scene,progress,seconds,duration,seek,scenes,setSceneDuration})=><main className="promo-shell"><div className="stage" data-scene={scene} role="img" aria-label={`Habi Analytics promo, ${scene} scene, ${duration} seconds`}><>{scene==='opening'&&<Today progress={progress} accent={accent}/>} {scene==='heatmap'&&<HeatMap progress={progress} accent={accent}/>} {scene==='bars'&&<Bars progress={progress} accent={accent}/>} {scene==='donut'&&<Donut progress={progress} accent={accent}/>} {scene==='closing'&&<Closing progress={progress} accent={accent}/>}</></div><TweaksPanel accent={accent} setAccent={setAccent} seconds={seconds} duration={duration} seek={seek} scenes={scenes} setSceneDuration={setSceneDuration} motionEditor={motionEditor} setMotionEditor={setMotionEditor}/></main>}</SceneStage>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<PromoRoot/>);
