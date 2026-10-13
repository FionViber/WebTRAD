'use strict';
(() => {
 const status=document.getElementById('asset-status'), message=document.getElementById('asset-message'), progress=document.getElementById('asset-progress'), actions=document.getElementById('asset-actions');
 const saveWarning=document.getElementById('save-warning');
 let hideTimer, retryActive=false, gameExited=false, fullscreenExit=null, fullscreenPrompted=null, persistenceGeneration=0;
 const shellStrings={"en":{"play":"Start game","restart":"Restart game","webgl":"This game requires a browser supporting WebGL 2.","fullscreen":"Press Esc to leave fullscreen and view loading or save notices.","save_failed":"Browser save failed. Progress from this session may be lost when this page closes.","save_unavailable":"The browser cannot save progress persistently. Progress from this session may be lost when this page closes.","loading":"Loading original game resources…","cancel_load":"Cancel loading","load_failed":"Unable to load","retry":"Retry","cancel":"Cancel","audio_failed":"Audio output initialization failed","reload_hint":"Reload the game to retry.","position_failed":"Audio position module unavailable","position_hint":"Main streaming audio initialized; the additional position module failed to load.","audio_enable":"Enable sound","audio_enabling":"Enabling sound…","audio_retry":"Sound did not start. Click to retry.","audio_hint":"Check browser sound permissions and your audio device. Original game sounds and playback order are preserved.","prepare":"Preparing game…","manifest_failed":"Unable to retrieve the game resource manifest","exit_uncertain":"The game exited, but saving could not be confirmed. This page has been kept open. Do not close it.","audio_init":"Initializing original audio…","start_failed":"Unable to start","reload_retry":"Reload and retry","quit_save":"Exiting and saving…","quit_retry":"Retry exit and save","save_unknown":"Unable to confirm browser save status","save_wait":"Browser save confirmation is still pending. This page has been kept open. Try again later.","save_uncertain":"Saving could not be confirmed. This page has been kept open.","quit_unavailable":"Unable to request a normal engine exit","quit_wait":"The engine has not finished exiting. This page has been kept open. Try again later.","reload_unsafe":"Unable to reload safely","save_busy":"This game is already open in another tab or window. Save and exit there, then close that page and reload this one.","save_guard_unavailable":"The game has not started because save protection is unavailable. Use an updated browser that permits local storage. Online deployments require HTTPS."},"de":{"play":"Spiel starten","restart":"Spiel neu starten","webgl":"Dieses Spiel benötigt einen Browser mit WebGL 2.","fullscreen":"Drücke Esc, um den Vollbildmodus zu verlassen und Lade- oder Speicherhinweise zu sehen.","save_failed":"Speichern im Browser fehlgeschlagen. Der Fortschritt dieser Sitzung kann beim Schließen verloren gehen.","save_unavailable":"Der Browser kann Fortschritte nicht dauerhaft speichern. Der Fortschritt dieser Sitzung kann beim Schließen verloren gehen.","loading":"Originale Spielressourcen werden geladen…","cancel_load":"Laden abbrechen","load_failed":"Laden fehlgeschlagen","retry":"Erneut versuchen","cancel":"Abbrechen","audio_failed":"Audioausgabe konnte nicht initialisiert werden","reload_hint":"Lade das Spiel neu, um es erneut zu versuchen.","position_failed":"Audiopositionsmodul nicht verfügbar","position_hint":"Audio-Streaming initialisiert; das zusätzliche Positionsmodul konnte nicht geladen werden.","audio_enable":"Ton aktivieren","audio_enabling":"Ton wird aktiviert…","audio_retry":"Ton nicht gestartet. Zum Wiederholen klicken.","audio_hint":"Prüfe die Tonberechtigungen des Browsers und dein Audiogerät. Originalton und Wiedergabereihenfolge bleiben erhalten.","prepare":"Spiel wird vorbereitet…","manifest_failed":"Ressourcenverzeichnis des Spiels nicht abrufbar","exit_uncertain":"Das Spiel wurde beendet, aber das Speichern konnte nicht bestätigt werden. Diese Seite bleibt geöffnet. Bitte nicht schließen.","audio_init":"Originalton wird initialisiert…","start_failed":"Start fehlgeschlagen","reload_retry":"Neu laden und wiederholen","quit_save":"Beenden und speichern…","quit_retry":"Beenden und Speichern wiederholen","save_unknown":"Browser-Speicherstatus nicht bestätigbar","save_wait":"Speicherbestätigung steht noch aus. Diese Seite bleibt geöffnet. Versuche es später erneut.","save_uncertain":"Speichern nicht bestätigt. Diese Seite bleibt geöffnet.","quit_unavailable":"Reguläres Beenden der Engine nicht anforderbar","quit_wait":"Die Engine wurde noch nicht vollständig beendet. Diese Seite bleibt geöffnet. Versuche es später erneut.","reload_unsafe":"Sicheres Neuladen nicht möglich","save_busy":"Dieses Spiel ist bereits in einem anderen Tab oder Fenster geöffnet. Speichere und beende das Spiel dort. Schließe dann diese andere Seite und lade diese Seite neu.","save_guard_unavailable":"Das Spiel wurde nicht gestartet, weil der Speicherschutz nicht verfügbar ist. Verwende einen aktuellen Browser, der lokalen Speicher erlaubt. Online ist HTTPS erforderlich."},"es":{"play":"Iniciar juego","restart":"Reiniciar juego","webgl":"Este juego requiere un navegador compatible con WebGL 2.","fullscreen":"Pulsa Esc para salir de pantalla completa y ver los avisos de carga o guardado.","save_failed":"El guardado del navegador falló. El progreso de esta sesión podría perderse al cerrar la página.","save_unavailable":"El navegador no puede guardar el progreso de forma persistente. El progreso de esta sesión podría perderse al cerrar la página.","loading":"Cargando recursos originales del juego…","cancel_load":"Cancelar carga","load_failed":"No se pudo cargar","retry":"Reintentar","cancel":"Cancelar","audio_failed":"Falló la inicialización de la salida de audio","reload_hint":"Recarga el juego para reintentar.","position_failed":"Módulo de posición de audio no disponible","position_hint":"Audio principal inicializado; el módulo adicional de posición no se pudo cargar.","audio_enable":"Activar sonido","audio_enabling":"Activando sonido…","audio_retry":"El sonido no se inició. Pulsa para reintentar.","audio_hint":"Revisa los permisos de sonido del navegador y tu dispositivo de audio. Se conservan los sonidos originales y su orden.","prepare":"Preparando juego…","manifest_failed":"No se pudo obtener el manifiesto de recursos del juego","exit_uncertain":"El juego se cerró, pero no se pudo confirmar el guardado. La página sigue abierta. No la cierres.","audio_init":"Inicializando audio original…","start_failed":"No se pudo iniciar","reload_retry":"Recargar y reintentar","quit_save":"Saliendo y guardando…","quit_retry":"Reintentar salida y guardado","save_unknown":"No se pudo confirmar el estado del guardado","save_wait":"La confirmación del guardado sigue pendiente. La página sigue abierta. Reintenta más tarde.","save_uncertain":"No se pudo confirmar el guardado. La página sigue abierta.","quit_unavailable":"No se pudo solicitar una salida normal del motor","quit_wait":"El motor no ha terminado de cerrarse. La página sigue abierta. Reintenta más tarde.","reload_unsafe":"No se puede recargar con seguridad","save_busy":"El juego ya está abierto en otra pestaña o ventana. Guarda y sal del juego allí; después cierra esa página y recarga esta.","save_guard_unavailable":"El juego no ha iniciado porque la protección de partidas no está disponible. Usa un navegador actualizado que permita almacenamiento local. En línea se requiere HTTPS."},"fr":{"play":"Lancer le jeu","restart":"Redémarrer le jeu","webgl":"Ce jeu nécessite un navigateur compatible avec WebGL 2.","fullscreen":"Appuyez sur Échap pour quitter le plein écran et voir les messages de chargement ou de sauvegarde.","save_failed":"La sauvegarde du navigateur a échoué. La progression de cette session risque d’être perdue à la fermeture.","save_unavailable":"Le navigateur ne peut pas sauvegarder durablement. La progression de cette session risque d’être perdue à la fermeture.","loading":"Chargement des ressources originales du jeu…","cancel_load":"Annuler le chargement","load_failed":"Chargement impossible","retry":"Réessayer","cancel":"Annuler","audio_failed":"Échec de l’initialisation de la sortie audio","reload_hint":"Rechargez le jeu pour réessayer.","position_failed":"Module de position audio indisponible","position_hint":"Audio principal initialisé ; le module de position supplémentaire n’a pas pu être chargé.","audio_enable":"Activer le son","audio_enabling":"Activation du son…","audio_retry":"Le son n’a pas démarré. Cliquez pour réessayer.","audio_hint":"Vérifiez les autorisations sonores du navigateur et votre périphérique audio. Les sons originaux et leur ordre sont conservés.","prepare":"Préparation du jeu…","manifest_failed":"Impossible de récupérer le manifeste des ressources du jeu","exit_uncertain":"Le jeu est fermé, mais la sauvegarde n’a pas pu être confirmée. Cette page reste ouverte. Ne la fermez pas.","audio_init":"Initialisation de l’audio original…","start_failed":"Démarrage impossible","reload_retry":"Recharger et réessayer","quit_save":"Fermeture et sauvegarde…","quit_retry":"Réessayer la fermeture et la sauvegarde","save_unknown":"Impossible de confirmer l’état de sauvegarde du navigateur","save_wait":"La confirmation de sauvegarde est en attente. Cette page reste ouverte. Réessayez plus tard.","save_uncertain":"La sauvegarde n’a pas pu être confirmée. Cette page reste ouverte.","quit_unavailable":"Impossible de demander la fermeture normale du moteur","quit_wait":"Le moteur n’a pas fini de se fermer. Cette page reste ouverte. Réessayez plus tard.","reload_unsafe":"Rechargement sûr impossible","save_busy":"Le jeu est déjà ouvert dans un autre onglet ou une autre fenêtre. Sauvegardez et quittez le jeu là-bas, puis fermez cette autre page et rechargez celle-ci.","save_guard_unavailable":"Le jeu n’a pas démarré car la protection des sauvegardes est indisponible. Utilisez un navigateur récent autorisant le stockage local. En ligne, HTTPS est requis."},"it":{"play":"Avvia gioco","restart":"Riavvia gioco","webgl":"Questo gioco richiede un browser che supporti WebGL 2.","fullscreen":"Premi Esc per uscire dallo schermo intero e vedere gli avvisi di caricamento o salvataggio.","save_failed":"Salvataggio del browser non riuscito. I progressi di questa sessione potrebbero andare persi chiudendo la pagina.","save_unavailable":"Il browser non può salvare i progressi in modo persistente. I progressi di questa sessione potrebbero andare persi chiudendo la pagina.","loading":"Caricamento delle risorse originali del gioco…","cancel_load":"Annulla caricamento","load_failed":"Impossibile caricare","retry":"Riprova","cancel":"Annulla","audio_failed":"Inizializzazione dell’uscita audio non riuscita","reload_hint":"Ricarica il gioco per riprovare.","position_failed":"Modulo di posizione audio non disponibile","position_hint":"Audio principale inizializzato; caricamento del modulo aggiuntivo di posizione non riuscito.","audio_enable":"Attiva audio","audio_enabling":"Attivazione audio…","audio_retry":"Audio non avviato. Fai clic per riprovare.","audio_hint":"Controlla le autorizzazioni audio del browser e il dispositivo audio. Suoni originali e ordine di riproduzione restano invariati.","prepare":"Preparazione del gioco…","manifest_failed":"Impossibile recuperare il manifesto delle risorse del gioco","exit_uncertain":"Il gioco è stato chiuso, ma il salvataggio non è confermato. Questa pagina resta aperta. Non chiuderla.","audio_init":"Inizializzazione dell’audio originale…","start_failed":"Impossibile avviare","reload_retry":"Ricarica e riprova","quit_save":"Chiusura e salvataggio…","quit_retry":"Riprova chiusura e salvataggio","save_unknown":"Impossibile confermare lo stato del salvataggio del browser","save_wait":"Conferma del salvataggio ancora in attesa. Questa pagina resta aperta. Riprova più tardi.","save_uncertain":"Salvataggio non confermato. Questa pagina resta aperta.","quit_unavailable":"Impossibile richiedere la chiusura normale del motore","quit_wait":"Il motore non ha terminato la chiusura. Questa pagina resta aperta. Riprova più tardi.","reload_unsafe":"Impossibile ricaricare in sicurezza","save_busy":"Il gioco è già aperto in un’altra scheda o finestra. Salva ed esci dal gioco lì, poi chiudi quella pagina e ricarica questa.","save_guard_unavailable":"Il gioco non è stato avviato perché la protezione dei salvataggi non è disponibile. Usa un browser aggiornato che consenta la memorizzazione locale. Online è richiesto HTTPS."},"ptbr":{"play":"Iniciar jogo","restart":"Reiniciar jogo","webgl":"Este jogo requer um navegador compatível com WebGL 2.","fullscreen":"Pressione Esc para sair da tela cheia e ver os avisos de carregamento ou salvamento.","save_failed":"O salvamento do navegador falhou. O progresso desta sessão pode ser perdido ao fechar esta página.","save_unavailable":"O navegador não pode salvar o progresso de forma persistente. O progresso desta sessão pode ser perdido ao fechar esta página.","loading":"Carregando recursos originais do jogo…","cancel_load":"Cancelar carregamento","load_failed":"Não foi possível carregar","retry":"Tentar novamente","cancel":"Cancelar","audio_failed":"Falha ao inicializar a saída de áudio","reload_hint":"Recarregue o jogo para tentar novamente.","position_failed":"Módulo de posição de áudio indisponível","position_hint":"Áudio principal inicializado; o módulo adicional de posição não pôde ser carregado.","audio_enable":"Ativar som","audio_enabling":"Ativando som…","audio_retry":"O som não iniciou. Clique para tentar novamente.","audio_hint":"Verifique as permissões de som do navegador e seu dispositivo de áudio. Os sons originais e a ordem de reprodução são preservados.","prepare":"Preparando jogo…","manifest_failed":"Não foi possível obter o manifesto de recursos do jogo","exit_uncertain":"O jogo foi fechado, mas não foi possível confirmar o salvamento. Esta página continua aberta. Não a feche.","audio_init":"Inicializando áudio original…","start_failed":"Não foi possível iniciar","reload_retry":"Recarregar e tentar novamente","quit_save":"Saindo e salvando…","quit_retry":"Tentar sair e salvar novamente","save_unknown":"Não foi possível confirmar o estado do salvamento do navegador","save_wait":"A confirmação do salvamento está pendente. Esta página continua aberta. Tente novamente mais tarde.","save_uncertain":"Não foi possível confirmar o salvamento. Esta página continua aberta.","quit_unavailable":"Não foi possível solicitar o encerramento normal do motor","quit_wait":"O motor ainda não terminou de encerrar. Esta página continua aberta. Tente novamente mais tarde.","reload_unsafe":"Não é possível recarregar com segurança","save_busy":"O jogo já está aberto em outra aba ou janela. Salve e saia do jogo lá, feche aquela página e recarregue esta.","save_guard_unavailable":"O jogo não iniciou porque a proteção dos jogos salvos está indisponível. Use um navegador atualizado que permita armazenamento local. On-line, HTTPS é necessário."},"zhcn":{"play":"开始游戏","restart":"重新启动游戏","webgl":"游戏需要支持 WebGL 2 的浏览器。","fullscreen":"请按 Esc 退出全屏，查看加载或存档提示。","save_failed":"浏览器存档写入失败。本次进度可能在关闭页面后丢失。","save_unavailable":"浏览器无法持久保存进度。本次进度可能在关闭页面后丢失。","loading":"正在加载原始游戏资源…","cancel_load":"取消加载","load_failed":"无法加载","retry":"重试","cancel":"取消","audio_failed":"音频输出初始化失败","reload_hint":"请重新加载游戏重试。","position_failed":"音频位置模块未就绪","position_hint":"主流式音频已初始化；附加位置模块加载失败。","audio_enable":"点击开启声音","audio_enabling":"正在开启声音…","audio_retry":"声音未启动，点击重试","audio_hint":"请检查浏览器声音权限和音频设备。游戏将保留原有音效和播放顺序。","prepare":"正在准备游戏…","manifest_failed":"无法获取游戏资源清单","exit_uncertain":"游戏已退出，但无法确认存档写入成功。页面已保留，请勿关闭。","audio_init":"正在初始化原始音频…","start_failed":"无法启动","reload_retry":"重新加载并重试","quit_save":"正在退出并保存…","quit_retry":"重试退出并保存","save_unknown":"无法确认浏览器存档状态","save_wait":"浏览器存档确认尚未完成，页面已保留。可稍后重试。","save_uncertain":"无法确认存档写入成功，页面已保留。","quit_unavailable":"无法请求原引擎正常退出","quit_wait":"原引擎尚未完成退出，页面已保留。可稍后重试。","reload_unsafe":"无法安全重载","save_busy":"游戏已在另一个标签页或窗口中打开。请先在那边保存并退出游戏，再关闭那个页面，然后重新加载此页。","save_guard_unavailable":"当前浏览器不支持存档保护，游戏尚未启动。请使用允许本地存储的新版浏览器；在线访问时请使用 HTTPS。"}};
 const normalizeLocale=value=>{const v=String(value||'').toLowerCase().replace(/[_-]/g,'');if(v.startsWith('zh'))return 'zhcn';if(v.startsWith('pt'))return 'ptbr';const lang=v.slice(0,2);return Object.hasOwn(shellStrings,lang)?lang:'en';};
 // Fresh profiles start in English; preserve explicit saved and live game-language choices.
 let shellLocale='en', localeListeners=new Set();
 try{const saved=globalThis.localStorage?.getItem('roottrees-ui-locale');if(saved&&Object.hasOwn(shellStrings,saved))shellLocale=saved;}catch(_){}
 const t=key=>shellStrings[shellLocale][key]||shellStrings.en[key]||key;
 const errorLabels=new WeakMap();
 const describeError=error=>errorLabels.get(error)?.()||error?.message||String(error);
 const localizedError=(key,detail)=>{const label=()=>t(key)+(detail?':'+describeError(detail):'');const error=new Error(label());errorLabels.set(error,label);return error;};
 const setLocale=value=>{shellLocale=normalizeLocale(value);try{globalThis.localStorage?.setItem('roottrees-ui-locale',shellLocale);}catch(_){}if(document.documentElement)document.documentElement.lang={zhcn:'zh-CN',ptbr:'pt-BR'}[shellLocale]||shellLocale;document.getElementById('play').textContent=t(gameExited?'restart':'play');document.getElementById('canvas').textContent=t('webgl');for(const listener of localeListeners)listener();};
 window.roottreeLocale={setLocale,getLocale:()=>shellLocale,text:t};
 const controlWaiters=new Set();
 setLocale(shellLocale);
 const promptFullscreenRecovery=()=>{
  if(document.fullscreenElement&&fullscreenPrompted!==document.fullscreenElement){
   fullscreenPrompted=document.fullscreenElement;
   try{window.alert?.(t('fullscreen'));}catch(error){console.warn('Fullscreen recovery prompt unavailable',error);}
  }
 };
 const leaveFullscreenForControls=()=>{
  if(fullscreenExit)return fullscreenExit;
  if(!document.fullscreenElement){fullscreenPrompted=null;return Promise.resolve(true);}
  fullscreenExit=Promise.resolve().then(async()=>{
   try {
    if(!document.exitFullscreen)throw Error('Fullscreen exit is unavailable');
    await document.exitFullscreen();
    if(document.fullscreenElement)throw Error('Fullscreen remains active');
    fullscreenPrompted=null;return true;
   }catch(error){
    console.warn('Unable to leave fullscreen for browser controls',error);
    return false;
   }
  }).finally(()=>{fullscreenExit=null;});
  return fullscreenExit;
 };
 const waitForControls=signal=>new Promise(resolve=>{
  let settled=false;
  const finish=result=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);controlWaiters.delete(cancel);resolve(result);};
  const cancel=()=>finish(null);controlWaiters.add(cancel);
  signal?.addEventListener('abort',cancel,{once:true});
  if(gameExited||signal?.aborted){cancel();return;}
  leaveFullscreenForControls().then(finish);
 });
 document.addEventListener?.('fullscreenchange',()=>{if(!document.fullscreenElement)fullscreenPrompted=null;});
 let saveWarningKey=null;
 const reportPersistence=async state=>{
  if(!saveWarning)return;
  const generation=++persistenceGeneration;
  if(state.available&&!state.error){saveWarningKey=null;saveWarning.hidden=true;return;}
  const visible=await leaveFullscreenForControls();
  if(generation!==persistenceGeneration)return;
  if(!visible)promptFullscreenRecovery();
  // A genuine save failure remains important on the restart screen after quit.
  saveWarningKey=state.available?'save_failed':'save_unavailable';saveWarning.hidden=false;saveWarning.textContent=t(saveWarningKey);
 };
 window.addEventListener('roottree-save-status',event=>reportPersistence(event.detail));
 let statusText=null;
 const actionLabels=new Map();
 const clearActions=()=>{actionLabels.clear();actions.replaceChildren();};
 const labelAction=(button,key)=>{actionLabels.set(button,key);button.textContent=t(key);};
 // Repaint text in place. Locale changes must not reset progress, cancel a retry,
 // recreate its buttons, or change a recovery action's disabled state.
 localeListeners.add(()=>{
  if(saveWarningKey)saveWarning.textContent=t(saveWarningKey);
  if(statusText)message.textContent=statusText();
  for(const [button,key] of actionLabels)button.textContent=t(key);
 });
 const show=(text,done,total)=>{clearTimeout(hideTimer);status.hidden=false;statusText=typeof text==='function'?text:()=>text;message.textContent=statusText();clearActions();if(total){progress.max=total;progress.value=done;}else progress.removeAttribute('value');};
 const update=p=>{if(gameExited||retryActive)return;show(()=>`${t('loading')} ${Math.round(p.done/1048576*10)/10} / ${Math.round(p.total/1048576*10)/10} MB`,p.done,p.total);if(window.roottreeAssets?.pending()>0){const cancel=document.createElement('button');labelAction(cancel,'cancel_load');cancel.onclick=()=>window.roottreeAssets.cancelAll();actions.append(cancel);}hideTimer=setTimeout(()=>status.hidden=true,1000);};
 let retryQueue=Promise.resolve();
 const retry=(error,resource,signal)=>{
  const task=retryQueue.then(async()=>{
   if(gameExited||signal?.aborted)return false;
   retryActive=true;clearTimeout(hideTimer);
   const visible=await waitForControls(signal);
   if(gameExited||signal?.aborted||visible===null){retryActive=false;status.hidden=true;clearActions();return false;}
   if(!visible)promptFullscreenRecovery();
   return new Promise(resolve=>{
    show(()=>`${t('load_failed')} ${resource.split('/').pop()}: ${describeError(error)}`);
    let settled=false;
    const finish=result=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);controlWaiters.delete(cancel);retryActive=false;status.hidden=true;clearActions();resolve(result);};
    const cancel=()=>finish(false);controlWaiters.add(cancel);
    signal?.addEventListener('abort',cancel,{once:true});
    if(gameExited||signal?.aborted){cancel();return;}
    for(const [key,result] of [['retry',true],['cancel',false]]){const b=document.createElement('button');labelAction(b,key);b.onclick=()=>finish(result);actions.append(b);}
   });
  });retryQueue=task.catch(()=>{});
  // A queued caller can cancel promptly without interrupting the active modal.
  if(!signal)return task;
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(value,error)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve(value);};
   const cancel=()=>finish(false);signal.addEventListener('abort',cancel,{once:true});
   if(signal.aborted)cancel();
   task.then(value=>finish(value),error=>finish(false,error));
  });
 };

 window.roottreeLoadingUI={update,retry};
 function setupAudioControl(button,audio,isExited=()=>false){
  if(!button||!audio)return;
  let attempt=0,audioTextKey=null,audioTitleKey=null;
  const labelText=key=>{audioTextKey=key;button.textContent=t(key);};
  const labelTitle=(key,diagnostic)=>{audioTitleKey=key;button.title=key?t(key):diagnostic;};
  const sync=()=>{
   if(isExited()){button.hidden=true;return;}
   const initialization=audio.initializationStatus?.();
   if(initialization?.output==='failed'){button.hidden=false;button.disabled=true;labelText('audio_failed');labelTitle(initialization.error?null:'reload_hint',initialization.error);return;}
   if(audio.state()==='running'){
    if(initialization?.position?.phase==='failed'){button.hidden=false;button.disabled=true;labelText('position_failed');labelTitle('position_hint');}
    else{button.hidden=true;button.disabled=false;}
   }else if(audio.state()!=='uninitialized'){button.hidden=false;button.disabled=false;labelText('audio_enable');}
  };
  localeListeners.add(()=>{if(audioTextKey)button.textContent=t(audioTextKey);if(audioTitleKey)button.title=t(audioTitleKey);});audio.observe?.(sync);sync();
  button.onclick=async()=>{
   const current=++attempt;button.disabled=true;labelText('audio_enabling');
   try{await Promise.race([audio.resume(),new Promise(resolve=>setTimeout(resolve,3000))]);}catch(error){console.warn('Audio resume failed',error);}
   if(current!==attempt||isExited())return;
   button.disabled=false;sync();
   if(audio.state()!=='running'){labelText('audio_retry');labelTitle('audio_hint');}
  };
 }
 window.roottreeAudioUI={setup:setupAudioControl};
 // One writer owns the entire IDBFS mount, including all slots and imports.
 // Keep the lock until the document is destroyed, even after engine exit.
 // Older unguarded tabs must be saved and closed before using this build.
 let writerAcquisition=null;
 const claimSaveWriter=()=>{
  if(writerAcquisition)return writerAcquisition;
  writerAcquisition=new Promise((resolve,reject)=>{
   const unavailable=()=>reject(localizedError('save_guard_unavailable'));
   try {
    const locks=globalThis.isSecureContext===true?navigator.locks:null;
    if(!locks||typeof locks.request!=='function'){unavailable();return;}
    const lifetime=locks.request('roottrees-idbfs:/userfs',{mode:'exclusive',ifAvailable:true},lock=>{
     if(!lock){reject(localizedError('save_busy'));return;}
     resolve();
     // The callback promise holds ownership. Do not release it on pagehide,
     // visibility changes, onExit, or import/restart reload initiation.
     return new Promise(()=>{});
    });
    Promise.resolve(lifetime).catch(unavailable);
   }catch(_){unavailable();}
  });
  return writerAcquisition;
 };
 // The portable release supplies local classic-script payloads in both file and HTTP modes.
 // Older HTTP-only releases retain their existing native fetch path.
 const portableData=window.RoottreesPortableData;
 let portableTransport=null;
 const originalFetch=(...args)=>{
  if(!portableData)return window.fetch(...args);
  if(!portableTransport)portableTransport=window.createPortableTransport(portableData.index,portableData.manifest,{base:new URL('./',location.href)});
  return portableTransport.fetch(...args);
 };
 const portableWorkletURLs=[];
 const prepareFileWorklets=async engine=>{
  if(!portableData||location.protocol!=='file:')return;
  if(!engine.config||typeof engine.config.getModuleConfig!=='function')throw Error('Unsupported audio module configuration');
  const modules=Object.create(null);
  for(const name of ['godot.audio.worklet.js','godot.audio.position.worklet.js']){
   const file=name.replace(/^godot\./,'index.');
   const response=await originalFetch(file);
   if(!response.ok)throw Error('Unable to read local audio module');
   const bytes=new Uint8Array(await response.arrayBuffer()),descriptor=portableData.index.assets[file];
   if(!descriptor||bytes.byteLength!==descriptor.bytes)throw Error('Local audio module length mismatch');
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(digest!==descriptor.sha256)throw Error('Local audio module integrity check failed');
   // file: documents may have opaque origins; some Chromium builds reject
   // blob:null worklet module fetches. A data URL carries the same verified
   // UTF-8 bytes without a Blob-origin lookup or any network request.
   let binary='';
   for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
   const url='data:text/javascript;charset=utf-8;base64,'+btoa(binary);
   portableWorkletURLs.push(url);modules[name]=url;
  }
  const original=engine.config.getModuleConfig;
  engine.config.getModuleConfig=function(...args){
   const config=original.apply(this,args),locate=config.locateFile;
   config.locateFile=function(path,...rest){return Object.hasOwn(modules,path)?modules[path]:locate.call(this,path,...rest);};
   return config;
  };
 };
 // Retain exact module URLs for initialization and output recovery.

 async function start(){
  let engine=null,engineStarted=false,reloadAfterQuit=false,recoveryAttempted=false,recoveryTimer=null,recoveryGeneration=0;
  const durableExit=()=>{try{const state=JSON.parse(window.RoottreesPersistence?.status()||'null');return !!state&&state.pending===0&&!state.error&&!!state.lastSuccess;}catch(_){return false;}};
  document.getElementById('play').disabled=true;
  try {
   // Engine.init populates IDBFS; never let an unowned tab reach it.
   await claimSaveWriter();
   show(()=>t('prepare'));
   const response=await originalFetch('asset-manifest.json',{cache:'no-cache'});if(!response.ok)throw localizedError('manifest_failed');
   const manifest=await response.json();
   const missing=Engine.getMissingFeatures({threads:!!manifest.threads});
   if(missing.length)throw Error(missing.join('; '));
   engine=new Engine({...manifest.engineConfig,canvas:document.getElementById('canvas'),canvasResizePolicy:2,onPrintError:console.error,onExit:async code=>{
    // Official onExit runs after Godot's finish_async and filesystem sync.
    gameExited=true;for(const cancel of [...controlWaiters])cancel();window.roottreeAssets?.cancelAll();clearTimeout(hideTimer);status.hidden=true;
    // A fullscreen canvas hides sibling DOM controls after the engine quits.
    if(!await leaveFullscreenForControls())promptFullscreenRecovery();
    clearTimeout(recoveryTimer);
    const panel=document.getElementById('start'),button=document.getElementById('play');
    panel.hidden=false;button.disabled=false;button.textContent=t('restart');button.onclick=()=>location.reload();
    const audioButton=document.getElementById('audio-unlock');if(audioButton)audioButton.hidden=true;
    window.dispatchEvent(new CustomEvent('roottree-exited',{detail:{code}}));
    if(recoveryAttempted){
     if(durableExit()){if(reloadAfterQuit)location.reload();}
     else{button.disabled=true;show(()=>t('exit_uncertain'));}
    }
   }});
   const loader=installRoottreeAssetBridge(engine,manifest,{base:new URL('./',location.href),fetch:originalFetch,progress:update,retry});
   window.roottreeEngine=engine;
   window.roottreeFetch=async file=>{
    const url=new URL(typeof file==='string'?file:file.url,location.href);
    if(url.href!==new URL('index.wasm',location.href).href)return originalFetch(file);
    const descriptor=manifest.engine['index.wasm'];let i=0,done=0;
    const transfer=new AbortController(),callerSignal=typeof file==='object'?file.signal:null;
    const cancel=()=>transfer.abort();callerSignal?.addEventListener('abort',cancel,{once:true});if(callerSignal?.aborted)cancel();
    return new Response(new ReadableStream({async pull(controller){
     try {if(i===descriptor.chunks.length){callerSignal?.removeEventListener('abort',cancel);controller.close();return;}const bytes=await loader.verifiedWasmChunk(descriptor.chunks[i++],transfer.signal);done+=bytes.length;update({done,total:descriptor.bytes});controller.enqueue(bytes);}catch(e){callerSignal?.removeEventListener('abort',cancel);controller.error(e);}
    },cancel(){callerSignal?.removeEventListener('abort',cancel);transfer.abort();}}),{headers:{'Content-Type':'application/wasm'}});
   };
   const engineFatal=new Promise((resolve,reject)=>{window.roottreeEngineFatal=reject;});
   await prepareFileWorklets(engine);
   await Promise.race([engine.init('index'),engineFatal]);
   const main=manifest.engine['bootstrap.pck'];let data=new Uint8Array(main.bytes),offset=0;
   for(const chunk of main.chunks){const bytes=await loader.verifiedChunk(chunk);data.set(bytes,offset);offset+=bytes.length;update({done:offset,total:main.bytes});}
   await engine.preloadFile(data,'bootstrap.pck');data=null;
   engineStarted=true;
   await engine.start({args:['--main-pack','bootstrap.pck']});
   if(window.RoottreesAudio?.whenOutputReady){
    show(()=>t('audio_init'));
    try{await window.RoottreesAudio.whenOutputReady();}
    catch(error){throw localizedError('audio_failed',error);}
   }
   if(gameExited)return;
   document.getElementById('start').hidden=true;status.hidden=true;document.getElementById('canvas').focus();
   window.dispatchEvent(new Event('roottree-ready'));
   if(window.RoottreesPersistence)reportPersistence(JSON.parse(window.RoottreesPersistence.status()));
   const unlock=document.getElementById('audio-unlock');
   setupAudioControl(unlock,window.RoottreesAudio,()=>gameExited);
  }catch(error){if(gameExited)return;const visible=await leaveFullscreenForControls();if(gameExited)return;if(!visible)promptFullscreenRecovery();show(()=>`${t('start_failed')}: ${describeError(error)}`);const b=document.createElement('button');labelAction(b,'reload_retry');
   b.onclick=async()=>{
    if(!engineStarted){location.reload();return;}
    b.disabled=true;labelAction(b,'quit_save');recoveryAttempted=true;reloadAfterQuit=false;const generation=++recoveryGeneration;
    const failed=text=>{if(generation!==recoveryGeneration)return;recoveryGeneration++;reloadAfterQuit=false;clearTimeout(recoveryTimer);show(text);b.disabled=false;labelAction(b,'quit_retry');actions.append(b);};
    try{
     if(!window.RoottreesPersistence)throw localizedError('save_unknown');
     clearTimeout(recoveryTimer);recoveryTimer=setTimeout(()=>failed(()=>t('save_wait')),15000);
     const error=await window.RoottreesPersistence.flush();
     if(generation!==recoveryGeneration)return;clearTimeout(recoveryTimer);
     if(error)throw error;
     if(gameExited){if(durableExit())location.reload();else failed(()=>t('save_uncertain'));return;}
     if(typeof engine.requestQuit!=='function')throw localizedError('quit_unavailable');
     reloadAfterQuit=true;
     recoveryTimer=setTimeout(()=>{if(!gameExited&&generation===recoveryGeneration)failed(()=>t('quit_wait'));},15000);
     engine.requestQuit();
    }catch(error){failed(()=>`${t('reload_unsafe')}:${describeError(error)}`);}
   };
   actions.append(b);document.getElementById('play').disabled=true;}
 }
 document.getElementById('play').addEventListener('click',start,{once:true});
})();
