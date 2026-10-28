// Guida per chi inizia. Ogni capitolo riassume sezioni del Core Rules ufficiale (2026-10-09),
// indicate in `rules`; l'app mostra il testo originale delle regole citate.
// I termini in corsivo nelle carte (Legend, Battlefield, ...) restano in inglese come sono stampati.

export interface LearnChapter {
  id: string
  title: string
  lead: string
  points: { text: string; rule?: string }[]
  rules: string[]
  /** Voci del glossario da approfondire. */
  related?: string[]
}

export const LEARN: LearnChapter[] = [
  {
    id: 'deck',
    title: 'Cosa ti serve per giocare',
    lead: 'Il tuo “deck” è fatto di quattro parti: una Legend, il mazzo principale, il mazzo delle rune e i campi di battaglia.',
    rules: ['103', '487.4'],
    points: [
      { text: 'Una Champion Legend: resta fuori dal mazzo e i suoi domini decidono quali carte puoi usare.', rule: '103.2' },
      { text: 'Un mazzo principale di almeno 40 carte, con dentro il tuo campione scelto (Chosen Champion): un’unità campione con lo stesso tag campione della Legend.', rule: '103.3' },
      { text: 'Massimo 3 copie per nome di carta, campione scelto incluso. Nomi diversi dello stesso personaggio contano come carte diverse.', rule: '103.3.b' },
      { text: 'Al massimo 3 carte Signature in tutto, e devono avere il tag campione della tua Legend.', rule: '103.3.d' },
      { text: 'Un mazzo delle rune di esattamente 12 rune, dei domini della Legend.', rule: '103.4' },
      { text: 'Nel duello 1 contro 1 porti 3 campi di battaglia con nomi diversi; in ogni partita se ne usa uno a testa.', rule: '487.4.a' },
    ],
  },
  {
    id: 'setup',
    title: 'Preparare la partita',
    lead: 'Prima del primo turno ognuno prepara le sue zone e pesca la mano iniziale.',
    rules: ['110', '111', '112', '114', '116', '117', '487.5', '487.7'],
    points: [
      { text: 'La Legend va nella sua zona, il campione scelto nella Champion Zone: da lì potrai giocarlo come una carta normale.', rule: '112' },
      { text: 'Nel duello ognuno pesca a caso uno dei suoi 3 campi di battaglia: in gioco ce ne sono 2.', rule: '487.5' },
      { text: 'Mescoli il mazzo principale e quello delle rune, separatamente.', rule: '114' },
      { text: 'Ognuno pesca 4 carte.', rule: '116' },
      { text: 'Mulligan: puoi mettere da parte fino a 2 carte, peschi altrettante carte e poi metti in fondo al mazzo quelle messe da parte.', rule: '117' },
      { text: 'Chi gioca per secondo, nel suo primo turno, prende una runa in più.', rule: '487.7' },
    ],
  },
  {
    id: 'win',
    title: 'Come si vince',
    lead: 'Non ci sono punti vita: vince chi arriva a 8 punti controllando i campi di battaglia.',
    rules: ['194', '471', '472', '473', '474'],
    related: ['burn-out'],
    points: [
      { text: 'Conquer (conquista): prendi il controllo di un campo che in questo turno non ti ha ancora dato punti. Guadagni 1 punto.', rule: '471.1' },
      { text: 'Hold (tenuta): all’inizio del tuo turno, ogni campo che controlli ancora ti dà 1 punto.', rule: '471.2' },
      { text: 'Ogni campo ti fa segnare al massimo una volta per turno, in un modo o nell’altro.', rule: '472' },
      { text: 'L’ultimo punto ha una regola speciale: se ti manca 1 punto e lo otterresti con una conquista, lo prendi solo se in questo turno hai segnato su tutti i campi; altrimenti peschi una carta.', rule: '473.1.b.1' },
      { text: 'I punti si possono ottenere anche da effetti delle carte, o quando un avversario va in Burn Out e sceglie te.', rule: '194.1' },
      { text: 'Si vince durante un cleanup, se hai almeno 8 punti e più di ogni avversario.', rule: '474' },
    ],
  },
  {
    id: 'turn',
    title: 'Le fasi del turno',
    lead: 'Ogni turno segue lo stesso ordine. In sintesi: preparare, segnare, rune, pescare, giocare, chiudere.',
    rules: ['315', '316', '317'],
    related: ['channel'],
    points: [
      { text: 'Awaken: prepari (raddrizzi) tutto quello che controlli.', rule: '315.1' },
      { text: 'Beginning: si risolvono gli effetti di inizio turno, poi segni i campi che tieni (hold).', rule: '315.2' },
      { text: 'Channel: prendi 2 rune dal mazzo delle rune.', rule: '315.3' },
      { text: 'Draw: peschi 1 carta. Se il mazzo è vuoto vai in Burn Out e poi peschi.', rule: '315.4' },
      { text: 'Main: la riserva di risorse si svuota; poi giochi carte, attivi abilità e muovi unità nell’ordine che vuoi.', rule: '316' },
      { text: 'Ending: le unità guariscono, finiscono gli effetti “per questo turno” e la riserva si svuota.', rule: '317.2' },
    ],
  },
  {
    id: 'runes',
    title: 'Rune, Energia e Potere',
    lead: 'Le rune producono le risorse per pagare le carte: l’Energia (il numero) e il Potere (il simbolo del dominio).',
    rules: ['160', '163', '164', '166', '167'],
    related: ['add', 'recycle'],
    points: [
      { text: 'Esaurire (girare) una runa aggiunge 1 Energia. L’Energia non ha colore.', rule: '164.2.a' },
      { text: 'Riciclare una runa (rimetterla in fondo al mazzo delle rune) aggiunge 1 Potere del suo dominio.', rule: '164.2.b' },
      { text: 'Il Potere serve per i costi colorati; alcuni costi accettano Potere di qualsiasi dominio.', rule: '163.2' },
      { text: 'Le risorse prodotte vanno nella tua riserva (Rune Pool), che si svuota all’inizio della Main Phase e a fine turno: quello che non spendi lo perdi.', rule: '167' },
    ],
  },
  {
    id: 'units',
    title: 'Unità e movimento',
    lead: 'Le unità entrano in gioco esauste e si muovono esaurendosi.',
    rules: ['143.4', '144'],
    related: ['accelerate', 'ganking'],
    points: [
      { text: 'Un’unità appena giocata entra esausta, salvo effetti come Accelerate.', rule: '143.4' },
      { text: 'Movimento standard: nella tua Main Phase, fuori dagli showdown, esaurisci l’unità per spostarla.', rule: '144.1' },
      { text: 'Dalla base si va a un campo di battaglia, da un campo si torna alla base. Da campo a campo solo con Ganking.', rule: '144.4' },
      { text: 'Puoi muovere più unità insieme, purché vadano tutte nello stesso posto.', rule: '144.3' },
    ],
  },
  {
    id: 'showdown',
    title: 'Showdown e combattimento',
    lead: 'Quando le tue unità arrivano su un campo che non controlli si apre uno showdown; se lì ci sono unità nemiche diventa un combattimento.',
    rules: ['344', '347', '348', '466', '467', '468'],
    related: ['action', 'reaction', 'assault', 'shield', 'tank'],
    points: [
      { text: 'Nello showdown i giocatori a turno possono giocare carte con Action o Reaction, oppure passare. Inizia chi ha conteso il campo.', rule: '347' },
      { text: 'Quando tutti passano di fila lo showdown si chiude. Se era un campo vuoto, chi ha ancora unità lì lo conquista.', rule: '348.2.a' },
      { text: 'In combattimento chi è arrivato è l’attaccante, l’altro è il difensore.', rule: '466.2.c' },
      { text: 'Danni: ogni lato somma la Might delle sue unità e distribuisce quel totale tra le unità avversarie, partendo dall’attaccante.', rule: '467.2' },
      { text: 'Bisogna dare danni letali a un’unità prima di passare alla successiva. I danni vengono inflitti tutti insieme.', rule: '467.2.c.3' },
      { text: 'Se restano unità di entrambi i lati, gli attaccanti tornano alla base. Chi resta da solo prende il controllo, e se non aveva ancora segnato quel campo conquista.', rule: '468.5' },
    ],
  },
  {
    id: 'cards',
    title: 'I tipi di carta',
    lead: 'Ogni carta ha un tipo, indicato sotto l’illustrazione.',
    rules: ['140', '147', '153', '169', '173', '179'],
    related: ['equip', 'deploy'],
    points: [
      { text: 'Unit: combattono e conquistano i campi. La Might è la loro forza e anche i danni che servono per eliminarle.', rule: '143.2' },
      { text: 'Champion Unit: un’unità campione. Quella con il tag della tua Legend può essere il tuo campione scelto.', rule: '103.3.a' },
      { text: 'Spell: fa il suo effetto e va nel cestino. Senza Action o Reaction si gioca solo nel tuo turno, fuori dagli showdown.', rule: '155' },
      { text: 'Gear: oggetti che entrano pronti nella tua base. Gli Equipment si attaccano alle unità.', rule: '149' },
      { text: 'Legend: il tuo leader. Non si gioca, non si muove e non si può uccidere; le sue abilità restano disponibili per tutta la partita.', rule: '174' },
      { text: 'Battlefield: i luoghi da conquistare. Hanno abilità proprie, spesso legate a quando vengono conquistati o tenuti.', rule: '170' },
      { text: 'Token: oggetti creati durante la partita dalle carte. Puoi rappresentarli con qualsiasi cosa.', rule: '181' },
    ],
  },
]
