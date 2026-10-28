// Glossario delle parole chiave e azioni di Riftbound.
//
// Ogni voce è scritta a partire dal Core Rules ufficiale (Rules Hub di Riot, aggiornamento 2026-10-09):
// `rules` elenca le sezioni da cui è tratta, e l'app mostra il testo inglese originale accanto alla
// spiegazione. Gli esempi usano carte reali presenti in public/data/cards.json.
// Regola d'oro (002): quando il testo di una carta contraddice le regole, vale la carta.

export type GlossaryKind = 'keyword' | 'action' | 'concept'

export interface GlossaryEntry {
  id: string
  /** Termine come è stampato sulle carte (inglese). */
  term: string
  kind: GlossaryKind
  /** Sezioni del Core Rules da cui è tratta la voce. */
  rules: string[]
  /** Una frase: cosa fa. */
  short: string
  /** Come funziona, punto per punto. */
  how: string[]
  example?: { cards: string[]; text: string }
  /** Il termine porta un valore numerico (es. Assault 2). */
  valued?: boolean
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'accelerate',
    term: 'Accelerate',
    kind: 'keyword',
    rules: ['805', '143.4'],
    short: 'Pagando un costo extra mentre giochi l’unità, entra in gioco pronta invece che esausta.',
    how: [
      'Di norma le unità entrano in gioco esauste (143.4), quindi non possono muoversi nel turno in cui le giochi.',
      'Accelerate è un costo aggiuntivo facoltativo: 1 Energia più 1 Potere di uno dei domini dell’unità. Se l’unità non ha domini, il Potere può essere di qualsiasi dominio.',
      'Si paga solo mentre giochi la carta: una volta in campo Accelerate non fa più nulla.',
      'L’unità entra direttamente pronta: non “entra esausta e poi si prepara”, quindi non attiva effetti legati al diventare pronta.',
    ],
    example: {
      cards: ['rad-020-167'],
      text: 'Mordekaiser, Twice Slain costa 7 Energia e 1 Potere Fury. Se paghi anche Accelerate (1 Energia e 1 Potere Fury in più) entra pronto: siccome il movimento standard costa esaurire l’unità (144.2), puoi mandarlo subito su un campo di battaglia nello stesso turno.',
    },
  },
  {
    id: 'action',
    term: 'Action',
    kind: 'keyword',
    rules: ['806'],
    short: 'Puoi giocare la carta (o attivare l’abilità) anche durante gli showdown, in qualsiasi turno.',
    how: [
      'Senza parole chiave, carte e abilità non si possono giocare durante uno showdown (343.1).',
      'Action dà il permesso di giocarle durante gli showdown, anche nel turno dell’avversario.',
      'Resta valido anche il momento normale: nel tuo turno puoi giocarla come qualsiasi altra carta.',
      'È solo un permesso, non cambia cosa fa la carta: un’unità con Action si gioca comunque solo nella tua base o su un campo che controlli.',
    ],
    example: {
      cards: ['rad-004-167'],
      text: 'Durante uno showdown su un campo di battaglia, quando hai il Focus puoi giocare Brawl per dare Assault a una tua unità prima che si calcolino i danni. Una carta senza Action, in quel momento, resterebbe in mano.',
    },
  },
  {
    id: 'reaction',
    term: 'Reaction',
    kind: 'keyword',
    rules: ['813'],
    short: 'Tutto quello che permette Action, più la possibilità di rispondere prima che un’altra carta si risolva.',
    how: [
      'Una carta con Reaction ha tutti i permessi di Action.',
      'In più si può giocare durante uno “stato chiuso”, cioè quando sulla catena c’è già qualcosa in attesa di risolversi: è il modo per rispondere a una magia o a un’abilità avversaria.',
      'Come Action, è solo un permesso: non cambia l’effetto della carta.',
    ],
    example: {
      cards: ['rad-048-167'],
      text: 'L’avversario gioca una magia per potenziare la sua unità. Prima che si risolva, rispondi con High Note: si mette sopra sulla catena e si risolve per prima, togliendo Might a quell’unità.',
    },
  },
  {
    id: 'assault',
    term: 'Assault',
    kind: 'keyword',
    valued: true,
    rules: ['807'],
    short: 'Finché l’unità sta attaccando ha +X Might.',
    how: [
      'Si scrive Assault X; se il numero manca vale 1.',
      'Il bonus vale solo mentre l’unità ha il ruolo di attaccante in un combattimento.',
      'Più fonti di Assault si sommano: Assault 1 più Assault 3 fa Assault 4.',
    ],
    example: {
      cards: ['unl-002-219'],
      text: 'Inferna ha 1 Might e Assault 2. Quando attacca un campo difeso contribuisce con 3 Might ai danni; quando invece difende resta a 1.',
    },
  },
  {
    id: 'shield',
    term: 'Shield',
    kind: 'keyword',
    valued: true,
    rules: ['814'],
    short: 'Finché l’unità sta difendendo ha +X Might.',
    how: [
      'Si scrive Shield X; se il numero manca vale 1.',
      'Il bonus vale solo mentre l’unità ha il ruolo di difensore in un combattimento.',
      'Più fonti di Shield si sommano.',
    ],
    example: {
      cards: ['rad-031-167'],
      text: 'Stoic Ferryman ha 2 Might e Shield 3: se un avversario attacca il campo dove si trova, difende con 5 Might.',
    },
  },
  {
    id: 'tank',
    term: 'Tank',
    kind: 'keyword',
    rules: ['815', '467.2.c'],
    short: 'In combattimento deve ricevere danni letali prima delle altre unità del suo controllore che non hanno Tank.',
    how: [
      'Nel passo dei danni ogni giocatore distribuisce i danni pari alla Might totale delle sue unità tra le unità avversarie.',
      'Bisogna sempre assegnare danni letali a un’unità prima di passare alla successiva.',
      'Con Tank, l’avversario deve riempire prima le unità con Tank; solo dopo può assegnare danni alle altre.',
      'Se ci sono più unità con Tank dello stesso giocatore, si possono colpire in qualsiasi ordine tra loro.',
    ],
    example: {
      cards: ['rad-122-167'],
      text: 'Difendi con Party Crasher (6 Might, Tank) e un’unità da 2. L’attaccante ha 7 danni da assegnare: ne deve mettere 6 su Party Crasher prima di poter colpire l’altra, a cui arriva solo 1 danno, non abbastanza per eliminarla.',
    },
  },
  {
    id: 'backline',
    term: 'Backline',
    kind: 'keyword',
    rules: ['826'],
    short: 'In combattimento riceve danni letali solo dopo tutte le altre unità del suo controllore che non hanno Backline.',
    how: [
      'È il contrario di Tank: l’unità con Backline si può colpire solo quando tutte le altre senza Backline hanno già ricevuto danni letali.',
      'Vale sempre la regola di assegnare danni letali a un’unità prima di passare alla successiva.',
    ],
    example: {
      cards: ['unl-043-219'],
      text: 'Enthusiastic Promoter (2 Might, Backline) difende insieme a un’unità da 3. L’attaccante con 4 danni deve prima assegnarne 3 all’unità da 3; resta 1 danno per Promoter, che sopravvive.',
    },
  },
  {
    id: 'deathknell',
    term: 'Deathknell',
    kind: 'keyword',
    rules: ['808'],
    short: 'Quando questo permanente muore, ottieni l’effetto scritto dopo la parola chiave.',
    how: [
      'Equivale a “Quando muoio, [effetto]”.',
      'Si attiva quando il permanente viene ucciso e finisce nel cestino (trash).',
      'Se la morte viene sostituita da un altro evento, per esempio un richiamo alla base, l’effetto non avviene.',
      'Se un permanente ha più Deathknell, ognuno si attiva separatamente e chi lo controlla sceglie l’ordine.',
    ],
    example: {
      cards: ['rad-119-167'],
      text: 'Hunting Dog muore in combattimento: grazie a Deathknell metti nella tua base un token Bird da 1 Might con Deflect.',
    },
  },
  {
    id: 'deflect',
    term: 'Deflect',
    kind: 'keyword',
    valued: true,
    rules: ['809'],
    short: 'Le magie e abilità avversarie che scelgono questo oggetto costano X Potere in più.',
    how: [
      'Si scrive Deflect X; se il numero manca vale 1.',
      'Il costo extra è obbligatorio e si paga ogni volta che l’oggetto viene scelto.',
      'Il Potere usato per pagarlo può essere di qualsiasi dominio.',
      'Più fonti di Deflect si sommano.',
    ],
    example: {
      cards: ['rad-036-167'],
      text: 'Storm Raptor ha Deflect: se l’avversario vuole colpirlo con una magia che costa 2, deve pagare anche 1 Potere in più, di qualsiasi dominio.',
    },
  },
  {
    id: 'ganking',
    term: 'Ganking',
    kind: 'keyword',
    rules: ['810', '144.4'],
    short: 'Con il movimento standard l’unità può spostarsi direttamente da un campo di battaglia a un altro.',
    how: [
      'Normalmente il movimento standard va solo dalla base a un campo di battaglia o da un campo alla base (144.4).',
      'Ganking aggiunge l’opzione campo → campo.',
      'Non è un movimento in più: è un’opzione in più per lo stesso movimento standard, che costa sempre esaurire l’unità.',
    ],
    example: {
      cards: ['rad-061-167'],
      text: 'Ekko, Ingenious è su un campo che controlli già. Invece di tornare alla base, con Ganking si sposta direttamente sull’altro campo per contestarlo.',
    },
  },
  {
    id: 'hidden',
    term: 'Hidden',
    kind: 'keyword',
    rules: ['811', '468.5.c'],
    short: 'Puoi nascondere la carta coperta su un tuo campo pagando 1 Potere, e dal turno dopo giocarla gratis come Reaction.',
    how: [
      'Nel tuo turno, quando non c’è niente sulla catena, puoi pagare 1 Potere di qualsiasi dominio per mettere la carta coperta su un campo di battaglia che controlli.',
      'Ogni campo può ospitare al massimo una carta coperta.',
      'Nascondere non è “giocare”: non apre una catena.',
      'Dal turno successivo la carta coperta ha Reaction e la puoi giocare ignorando il suo costo base.',
      'Quando la giochi da coperta, le sue scelte sono limitate a quel campo: un’unità o un equipaggiamento entra lì, e i bersagli si scelgono tra ciò che c’è lì.',
      'La carta coperta resta solo finché controlli quel campo: se lo perdi in combattimento viene rimossa (468.5.c).',
      'In alternativa puoi sempre giocarla in modo normale, pagando il suo costo.',
    ],
    example: {
      cards: ['rad-081-167'],
      text: 'Nel tuo turno nascondi Elnuk Herd su un campo che controlli pagando 1 Potere. Nel turno dell’avversario, quando attacca quel campo, la giochi gratis come Reaction: Elnuk Herd entra in quel campo, dà +3 Might per il turno a un’altra tua unità che si trova lì e, essendo stata giocata da coperta, va poi in fondo al tuo mazzo (recycle).',
    },
  },
  {
    id: 'legion',
    term: 'Legion',
    kind: 'keyword',
    rules: ['812'],
    short: 'Il testo dopo Legion è attivo se in questo turno hai già giocato un’altra carta.',
    how: [
      'Equivale a “Se in questo turno hai giocato un’altra carta, questa carta ottiene [testo]”.',
      'Basta una qualsiasi altra carta giocata da te in questo turno.',
      'Una sola carta giocata soddisfa tutti i Legion delle tue carte.',
    ],
    example: {
      cards: ['ogn-016-298'],
      text: 'Nel mazzo di Rumble: giochi prima una magia, poi Dangerous Duo. Legion è attivo, quindi quando lo giochi dai +2 Might a un’unità per questo turno. Se Dangerous Duo fosse la prima carta del turno, non succederebbe niente.',
    },
  },
  {
    id: 'temporary',
    term: 'Temporary',
    kind: 'keyword',
    rules: ['816'],
    short: 'All’inizio della Beginning Phase di chi lo controlla, prima dei punti, il permanente viene ucciso.',
    how: [
      'Il permanente resta in gioco per il resto del turno e per il turno dell’avversario.',
      'All’inizio del tuo turno successivo, prima che si contino i campi tenuti (hold), viene ucciso.',
      'Averne più copie non cambia nulla: si attiva una volta sola.',
    ],
    example: {
      cards: ['ogn-094-298'],
      text: 'Sprite Call mette in gioco un token Sprite da 3 Might, pronto e con Temporary. Puoi usarlo subito per attaccare; all’inizio del tuo prossimo turno muore prima del conteggio dei punti, quindi non ti aiuta a tenere un campo.',
    },
  },
  {
    id: 'vision',
    term: 'Vision',
    kind: 'keyword',
    rules: ['817', '437'],
    short: 'Quando questo permanente viene giocato, fai Predict: guardi la prima carta del mazzo e puoi metterla in fondo.',
    how: [
      'Equivale a “Quando questo viene giocato, Predict”.',
      'Se ci sono più Vision, ognuno si attiva separatamente.',
    ],
    example: {
      cards: ['ven-065-166'],
      text: 'Giochi Swain, Visionary: guardi la prima carta del tuo mazzo. Se non ti serve la metti in fondo, altrimenti la lasci in cima e la pescherai.',
    },
  },
  {
    id: 'predict',
    term: 'Predict',
    kind: 'action',
    valued: true,
    rules: ['437', '417'],
    short: 'Guardi le prime X carte del mazzo, ne metti in fondo quante vuoi e rimetti le altre in cima nell’ordine che preferisci.',
    how: [
      'Si scrive Predict X; se il numero manca vale 1.',
      'Le carte scartate così vanno in fondo al mazzo (recycle), non nel cestino.',
      'Se nel mazzo ci sono meno carte, guardi quelle che ci sono: Predict non causa mai Burn Out.',
    ],
    example: {
      cards: ['rad-050-167'],
      text: 'Giochi Mysterious Chronomancer: Predict 2. Guardi le prime due carte, metti in fondo quella che non ti serve e lasci l’altra in cima.',
    },
  },
  {
    id: 'equip',
    term: 'Equip',
    kind: 'keyword',
    rules: ['818', '137', '716'],
    short: 'Pagando il costo indicato, attacchi questo equipaggiamento a una tua unità.',
    how: [
      'Si trova sui gear con il tag Equipment ed equivale a “[Costo]: attacca questo gear a un’unità che controlli”.',
      'L’unità scelta è un bersaglio.',
      'Il numero in basso a destra del gear (Might Bonus) si somma alla Might dell’unità finché il gear è attaccato.',
      'Se ci sono più Equip, ognuno è un’abilità separata.',
    ],
    example: {
      cards: ['sfd-095-221'],
      text: 'Doran’s Blade ha Equip pagabile con 1 Potere Body e Might Bonus +2. Paghi il Potere e lo attacchi a una tua unità da 3 Might, che passa a 5.',
    },
  },
  {
    id: 'quick-draw',
    term: 'Quick-Draw',
    kind: 'keyword',
    rules: ['819'],
    short: 'L’equipaggiamento ha Reaction e, quando lo giochi, si attacca subito a una tua unità.',
    how: [
      'Si trova sui gear con Equip.',
      'Equivale a “Reaction” più “Quando giochi questo, attaccalo a un’unità che controlli”.',
      'Ti permette di giocare e attaccare l’equipaggiamento anche in risposta, nel mezzo di un combattimento.',
    ],
    example: {
      cards: ['sfd-054-221'],
      text: 'Con Jax, Unmatched in gioco, ogni Equipment nella tua mano ha Quick-Draw: durante lo showdown di un combattimento giochi un equipaggiamento dalla mano e si attacca subito a una tua unità.',
    },
  },
  {
    id: 'repeat',
    term: 'Repeat',
    kind: 'keyword',
    rules: ['820'],
    short: 'Pagando un costo aggiuntivo, l’effetto della magia o abilità viene eseguito una seconda volta.',
    how: [
      'È un costo aggiuntivo facoltativo che si paga mentre giochi la carta.',
      'Le scelte della seconda esecuzione possono essere diverse dalla prima, anche un altro bersaglio.',
      'La carta conta comunque come giocata una sola volta.',
    ],
    example: {
      cards: ['sfd-129-221'],
      text: 'Temptation ha Repeat 2 Energia. Se lo paghi, sposti due unità nemiche invece di una, e la seconda può essere diversa dalla prima.',
    },
  },
  {
    id: 'weaponmaster',
    term: 'Weaponmaster',
    kind: 'keyword',
    rules: ['821'],
    short: 'Quando giochi l’unità, puoi attaccarle un tuo Equipment pagandone l’Equip con 1 Potere in meno.',
    how: [
      'Scegli un tuo gear con il tag Equipment, anche se è già attaccato a un’altra unità.',
      'Paghi il suo costo di Equip ridotto di 1 Potere di qualsiasi dominio e lo attacchi a questa unità.',
      'Se il costo di Equip non contiene Potere generico, si paga intero; se non si può pagare, l’equipaggiamento resta dov’è.',
    ],
    example: {
      cards: ['sfd-002-221', 'sfd-095-221'],
      text: 'Hai Doran’s Blade attaccato a un’altra unità. Giochi Armed Assailant: con Weaponmaster puoi spostare Doran’s Blade su di lui. Attenzione: il suo costo di Equip è 1 Potere Body, non Potere generico, quindi non viene ridotto e lo paghi intero (821.1.c.3).',
    },
  },
  {
    id: 'ambush',
    term: 'Ambush',
    kind: 'keyword',
    rules: ['822'],
    short: 'Puoi giocare l’unità direttamente su un campo dove hai già unità, e in quel caso ha Reaction.',
    how: [
      'Di norma un’unità si gioca nella tua base o su un campo che controlli.',
      'Ambush aggiunge i campi dove hai almeno un’unità, anche se il campo è conteso.',
      'Giocata così ha Reaction, quindi puoi farla entrare anche nel mezzo di un combattimento.',
      'Se al momento di completare la giocata non hai più unità lì, Ambush non vale più per quel campo.',
    ],
    example: {
      cards: ['ven-123-166'],
      text: 'L’avversario attacca un campo dove hai un’unità. Durante lo showdown giochi Soulspinner con Ambush direttamente su quel campo: entra come difensore e aggiunge la sua Might al combattimento.',
    },
  },
  {
    id: 'xp',
    term: 'XP',
    kind: 'concept',
    rules: ['728', '729', '730', '731', '733'],
    short: 'Esperienza: una risorsa del giocatore che si accumula e si spende.',
    how: [
      'Ogni giocatore tiene il conto dei suoi XP in modo visibile: è un’informazione pubblica.',
      'Non c’è un limite massimo.',
      'Gli XP non sono oggetti di gioco: non si possono bersagliare, preparare o esaurire.',
    ],
  },
  {
    id: 'hunt',
    term: 'Hunt',
    kind: 'keyword',
    valued: true,
    rules: ['823'],
    short: 'Quando questa unità conquista o tiene un campo, guadagni X XP.',
    how: [
      'Si scrive Hunt X; se il numero manca vale 1.',
      'Si attiva sia con la conquista (conquer) sia con la tenuta (hold).',
      'Più fonti di Hunt si sommano.',
    ],
    example: {
      cards: ['unl-034-219'],
      text: 'Herald of Spring ti dà 2 XP quando lo giochi. Con Hunt, ogni volta che conquista o tiene un campo guadagni 1 XP in più.',
    },
  },
  {
    id: 'level',
    term: 'Level',
    kind: 'keyword',
    valued: true,
    rules: ['824'],
    short: 'Il testo dopo Level N è attivo finché hai almeno N XP.',
    how: [
      'Equivale a “Finché hai N o più XP, questa carta ottiene [testo]”.',
      'Se i tuoi XP scendono sotto N, l’effetto si spegne subito.',
    ],
    example: {
      cards: ['unl-016-219'],
      text: 'Scorchclaw ha Level 3: se quando lo giochi hai almeno 3 XP entra pronto e ha +1 Might.',
    },
  },
  {
    id: 'unique',
    term: 'Unique',
    kind: 'keyword',
    rules: ['825'],
    short: 'Nel mazzo puoi avere una sola copia di una carta con questo nome.',
    how: [
      'È un vincolo di costruzione del mazzo: durante la partita non fa niente.',
      'Se una carta è sia Signature sia Unique, valgono entrambi i limiti: massimo 3 Signature in totale, e una sola copia per ogni nome Unique.',
    ],
    example: {
      cards: ['sfd-190-221'],
      text: 'Forgefire Cape è Unique: anche se ne possiedi tre copie, nel mazzo ne puoi mettere una.',
    },
  },
  {
    id: 'empower',
    term: 'Empower',
    kind: 'keyword',
    rules: ['827', '442'],
    short: 'Pagando il costo indicato, questo oggetto diventa Empowered.',
    how: [
      'Equivale a “[Costo]: rendi questo Empowered. Usala solo se non è già Empowered”.',
      'Il costo può essere di risorse (Energia, Potere) o un’azione, per esempio scartare una carta.',
      'Di norma uno stesso oggetto è Empowered o non lo è: non si accumula, salvo carte che lo permettono esplicitamente.',
    ],
    example: {
      cards: ['ven-007-166'],
      text: 'Nel mazzo di Zed: Punching Poro ha “Empower — Discard 1”. Scarti una carta dalla mano e Punching Poro diventa Empowered.',
    },
  },
  {
    id: 'empowered',
    term: 'Empowered',
    kind: 'keyword',
    rules: ['828', '442'],
    short: 'Il testo dopo Empowered è attivo finché questo oggetto è Empowered.',
    how: [
      'Equivale a “Finché ho lo stato Empowered, questa carta ottiene [testo]”.',
      'Gli effetti “quando divento Empowered” si attivano nel momento in cui lo diventa.',
    ],
    example: {
      cards: ['ven-007-166'],
      text: 'Una volta Empowered, Punching Poro ottiene “Ho +1 Might” e passa da 2 a 3 Might.',
    },
  },
  {
    id: 'flow',
    term: 'Flow',
    kind: 'keyword',
    rules: ['829'],
    short: 'Puoi rigiocare questa magia dal cestino pagando il costo di Flow; poi viene esiliata (banish).',
    how: [
      'Il costo di Flow sostituisce il costo base della magia quando la giochi dal cestino.',
      'I tempi in cui puoi giocarla non cambiano: cambia solo la zona da cui parte.',
      'Dopo averla giocata così, invece di tornare nel cestino viene esiliata e non la rivedrai.',
    ],
    example: {
      cards: ['ven-031-166'],
      text: 'Nel mazzo di Shen: hai già usato Twilight Shroud, che è nel cestino. Più tardi lo rigiochi dal cestino pagando il suo costo di Flow, 2 Energia, e dopo l’effetto viene esiliato.',
    },
  },
  {
    id: 'burn',
    term: 'Burn',
    kind: 'action',
    valued: true,
    rules: ['441', '432'],
    short: 'Metti le prime X carte del mazzo nel cestino.',
    how: [
      'Se devi bruciare più carte di quante ne hai nel mazzo, bruci quelle che ci sono, vai in Burn Out e poi bruci il resto.',
      'Gli effetti “quando bruci” si risolvono dopo che le carte sono finite nel cestino.',
    ],
    example: {
      cards: ['ven-002-166'],
      text: 'Nel mazzo di Zed: la prima volta che Blade Twirler si muove in un turno scegli un giocatore, che mette la prima carta del suo mazzo nel cestino.',
    },
  },
  {
    id: 'burn-out',
    term: 'Burn Out',
    kind: 'action',
    rules: ['432', '315.4.b'],
    short: 'Succede quando devi prendere carte da un mazzo vuoto: rimescoli il cestino nel mazzo e un avversario guadagna 1 punto.',
    how: [
      'Fai tutto quello che puoi dell’azione che lo ha causato.',
      'Rimescoli il cestino e lo rimetti come mazzo.',
      'Scegli un avversario: guadagna 1 punto.',
      'Poi completi l’azione, per esempio peschi.',
      'Guardare o rivelare carte da un mazzo vuoto non causa Burn Out.',
    ],
  },
  {
    id: 'deploy',
    term: 'Deploy',
    kind: 'keyword',
    rules: ['830', '459.1'],
    short: 'Questo gear si gioca solo su un campo di battaglia, ci resta, e muore se un avversario tiene quel campo.',
    how: [
      'Puoi giocarlo su qualsiasi campo, anche occupato da nemici o vuoto, ma mai nella base.',
      'Normalmente i gear su un campo tornano alla base nel cleanup: quelli con Deploy restano dove sono.',
      'Quando un avversario ottiene la tenuta (hold) di quel campo, il gear viene ucciso.',
    ],
    example: {
      cards: ['rad-002-167'],
      text: 'Metti Banner of Conquest sul campo che vuoi attaccare: le tue unità lì hanno Assault finché il Banner resta in gioco.',
    },
  },
  {
    id: 'disarm',
    term: 'Disarm',
    kind: 'keyword',
    valued: true,
    rules: ['831'],
    short: 'Quando questa unità attacca, un’unità nemica in quel campo ha −X Might per il turno.',
    how: [
      'Si scrive Disarm X; se il numero manca vale 1.',
      'Si attiva una volta sola anche con più Disarm, usando il valore totale.',
    ],
    example: {
      cards: ['rad-054-167'],
      text: 'Trinket Peddler attacca un campo difeso da un’unità da 3 Might: con Disarm quell’unità scende a 2 Might per questo turno.',
    },
  },
  {
    id: 'show-off',
    term: 'Show Off',
    kind: 'keyword',
    rules: ['832'],
    short: 'Mentre giochi la carta puoi mostrare un oggetto richiesto (dalla mano o tra i tuoi in gioco) per ottenere un effetto extra.',
    how: [
      'Puoi rivelare la carta richiesta dalla mano oppure indicare un tuo oggetto già in gioco.',
      'La decisione si prende mentre giochi la carta.',
      'I dati dell’oggetto mostrato si leggono in quel momento: cambiamenti successivi non contano.',
    ],
    example: {
      cards: ['rad-011-167'],
      text: 'Giochi Incorrigible Construct e mostri un Mech dalla mano (o un tuo Mech in gioco): entra pronto invece che esausto.',
    },
  },
  {
    id: 'stun',
    term: 'Stun',
    kind: 'action',
    rules: ['424'],
    short: 'Un’unità stordita non infligge danni in combattimento per il resto del turno.',
    how: [
      'Un’unità è stordita o non lo è: stordirla di nuovo non fa nulla.',
      'Per ucciderla servono comunque danni pari alla sua Might piena.',
      'Lo stordimento finisce nel cleanup di fine turno.',
    ],
    example: {
      cards: ['rad-028-167'],
      text: 'Durante uno showdown esaurisci una tua unità per pagare Ki Burst e stordisci l’unità nemica più forte: nel combattimento non contribuisce ai danni.',
    },
  },
  {
    id: 'buff',
    term: 'Buff',
    kind: 'action',
    rules: ['427', '701', '702', '703', '705'],
    short: 'Metti un segnalino buff su un’unità: +1 Might. Un’unità può averne uno solo.',
    how: [
      'Ogni buff dà +1 Might.',
      'Un’unità può avere un solo buff: se ne ha già uno, non ne riceve un altro.',
      'Alcune carte ti fanno “spendere” il buff (lo togli) per ottenere un effetto.',
      'Se l’unità lascia il gioco perde il buff.',
    ],
    example: {
      cards: ['rad-043-167'],
      text: 'Ogni volta che Riven, Broken Blade si esaurisce scegli un’opzione non ancora scelta in questo turno: darle un buff (+1 Might), oppure spendere il suo buff per stordire un nemico, oppure spenderlo per prepararla di nuovo.',
    },
  },
  {
    id: 'mighty',
    term: 'Mighty',
    kind: 'concept',
    rules: ['706', '707', '708', '709', '711'],
    short: 'Un’unità è Mighty se ha 5 o più Might.',
    how: [
      'In gioco conta la Might attuale, con bonus e malus. Fuori dal gioco (mano, mazzo, cestino) conta quella stampata.',
      '“Diventa Mighty” succede quando passa da meno di 5 a 5 o più.',
    ],
    example: {
      cards: ['sfd-106-221'],
      text: 'Show of Strength ti fa pescare una carta per ogni tua unità Mighty: con due unità da 5 o più Might peschi 2.',
    },
  },
  {
    id: 'add',
    term: 'Add',
    kind: 'action',
    rules: ['430', '164.2'],
    short: 'Aggiungi Energia o Potere alla tua riserva per pagare i costi.',
    how: [
      'Le rune base hanno due abilità: esaurirle aggiunge 1 Energia; riciclarle aggiunge 1 Potere del loro dominio.',
      'Le abilità che aggiungono risorse si risolvono subito, anche nel mezzo del pagamento di un costo.',
      'La riserva si svuota all’inizio della Main Phase e a fine turno: quello che non spendi lo perdi.',
    ],
    example: {
      cards: ['rad-015-167'],
      text: 'La prima volta che Akali, Brash si muove in un turno aggiungi 1 Energia e 1 Potere di qualsiasi dominio, da spendere prima della fine del turno.',
    },
  },
  {
    id: 'channel',
    term: 'Channel',
    kind: 'action',
    rules: ['431', '315.3'],
    short: 'Prendi rune dalla cima del mazzo delle rune e le metti in gioco.',
    how: [
      'Ogni turno, nella Channel Phase, prendi 2 rune.',
      'Le rune prese così entrano pronte, salvo indicazioni diverse sulla carta.',
      'Se non ce ne sono abbastanza, ne prendi quante ce ne sono.',
    ],
    example: {
      cards: ['rad-086-167'],
      text: 'Quando K’Sante, Courageous tiene un campo, prendi 1 runa in più dal mazzo delle rune.',
    },
  },
  {
    id: 'banish',
    term: 'Banish',
    kind: 'action',
    rules: ['428'],
    short: 'La carta va nella zona di esilio (banishment), non nel cestino.',
    how: [
      'Esiliare non è uccidere né scartare: gli effetti “quando muore” non si attivano.',
      'Alcune carte possono interagire con le carte che loro stesse hanno esiliato.',
    ],
  },
  {
    id: 'recycle',
    term: 'Recycle',
    kind: 'action',
    rules: ['417'],
    short: 'Metti la carta in fondo al suo mazzo: le carte normali nel mazzo principale, le rune nel mazzo delle rune.',
    how: [
      'Se ricicli più carte del mazzo principale insieme, vanno in fondo in ordine casuale.',
      'Le rune riciclate insieme vanno in fondo nell’ordine che scegli tu.',
    ],
  },
]

export const GLOSSARY_BY_ID = Object.fromEntries(GLOSSARY.map((g) => [g.id, g]))

/** Associa il termine tra parentesi quadre del testo di una carta a una voce del glossario. */
export function glossaryIdForTerm(raw: string): string | undefined {
  const term = raw.replace(/\s*\d+$/, '').trim().toLowerCase()
  return GLOSSARY.find((g) => g.term.toLowerCase() === term)?.id
}
