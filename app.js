import { Chessground } from '@lichess-org/chessground';

import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';

import { libraries } from './positions.js';


// ==================================================
// PARAMÈTRES URL
// ==================================================

const urlParams =
    new URLSearchParams(
        window.location.search
    );


let activeLibraryKey =
    urlParams.get('finale') || 'philidor';


if (!libraries[activeLibraryKey]) {

    activeLibraryKey = 'philidor';

}


// ==================================================
// JEU
// ==================================================

const game = new Chess();


// ==================================================
// ÉTAT
// ==================================================

let thinking = false;

let playerSide = 'white';

let currentStartFen = '';

let rootNode = null;

let currentNode = null;

let searchId = 0;

let pendingPromotion = null;


// ==================================================
// DERNIER COUP À SURBRILLER
// ==================================================

function getLastMoveSquares() {

    if (
        currentNode &&
        currentNode.move &&
        currentNode.move.from &&
        currentNode.move.to
    ) {

        return [
            currentNode.move.from,
            currentNode.move.to
        ];

    }


    return [];

}


// ==================================================
// COMMENTAIRE DE FIN DE PARTIE
// ==================================================

function getGameTerminationComment() {

    if (
        game.in_checkmate &&
        game.in_checkmate()
    ) {

        return 'Mat';

    }


    if (
        game.in_stalemate &&
        game.in_stalemate()
    ) {

        return 'Pat';

    }

    if (
        game.insufficient_material &&
        game.insufficient_material()
    ) {

        return 'Nulle - Matériel';
    }




    if (
        game.in_threefold_repetition &&
        game.in_threefold_repetition()
    ) {

        return 'Nulle - Répétition';

    }


    const fenParts =
        game.fen().split(' ');


    const halfmoveClock =
        parseInt(
            fenParts[4] || '0',
            10
        );


    if (
        halfmoveClock >= 100
    ) {

        return 'Nulle - 50 coups';

    }


    return 'Partie terminée';

}


// ==================================================
// ÉVALUATION
// ==================================================

let evaluationVisible = false;

let latestEvaluation = '—';

let evaluatingPosition = false;

let evaluationSearchId = 0;

// ==================================================
// TABLES DE FINALES LICHESS
// ==================================================

const TABLEBASE_ENDPOINT =
    'https://tablebase.lichess.org/standard';

const TABLEBASE_MAX_PIECES = 7;


// ==================================================
// CASES
// ==================================================

const SQUARES = [

    'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8',
    'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7',
    'a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6',
    'a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5',
    'a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4',
    'a3', 'b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3',
    'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2',
    'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1'

];


// ==================================================
// STOCKFISH
// ==================================================

const stockfish =
    new Worker(
        './stockfish/stockfish-18-lite-single.js'
    );


// ==================================================
// MODE ANALYSE
// ==================================================

function isAnalysisMode() {

    return playerSide === 'analysis';

}


// ==================================================
// BOUTONS DE MODE
// ==================================================

function setupModeButtonImages() {

    const buttons =
        document.querySelectorAll(
            '.mode-button'
        );


    buttons.forEach(

        button => {

            const mode =
                button.dataset.mode;


            button.innerHTML =
                '';


            const image =
                document.createElement(
                    'img'
                );


            if (
                mode === 'white'
            ) {

                image.src =
                    './pieces/alpha/wK.svg';

                image.alt =
                    'Jouer avec les Blancs';

            }

            else if (
                mode === 'black'
            ) {

                image.src =
                    './pieces/alpha/bK.svg';

                image.alt =
                    'Jouer avec les Noirs';

            }

            else if (
                mode === 'analysis'
            ) {

                image.src =
                    './images/king-bicolor.svg';

                image.alt =
                    'Mode analyse';

            }


            image.className =
                'mode-piece-image';


            button.appendChild(
                image
            );

        }

    );

}



// ==================================================
// SÉLECTION VISUELLE DU MODE
// ==================================================

function selectModeButton(mode) {

    document
        .querySelectorAll('.mode-button')
        .forEach(button => {

            const selected =
                button.dataset.mode === mode;

            button.classList.toggle(
                'selected',
                selected
            );

            button.setAttribute(
                'aria-pressed',
                selected ? 'true' : 'false'
            );

        });

}


// ==================================================
// SOUS-TITRE DU TYPE DE FINALE
// ==================================================

function getLibraryPieceTypes() {

    const library =
        libraries[activeLibraryKey];

    if (
        !library ||
        !library.positions ||
        library.positions.length === 0
    ) {
        return { white: [], black: [] };
    }

    const placement =
        library.positions[0].fen
            .trim()
            .split(/\s+/)[0];

    const white = new Set();
    const black = new Set();

    for (const character of placement) {

        if (/[1-8/]/.test(character)) {
            continue;
        }

        if (character === character.toUpperCase()) {
            white.add(character);
        } else {
            black.add(character.toUpperCase());
        }

    }

    const order =
        ['K', 'Q', 'R', 'B', 'N', 'P'];

    return {
        white:
            order.filter(piece => white.has(piece)),
        black:
            order.filter(piece => black.has(piece))
    };

}


function createSubtitlePiece(color, piece) {

    const image =
        document.createElement('img');

    image.src =
        './pieces/alpha/' +
        color +
        piece +
        '.svg';

    image.alt = '';
    image.setAttribute('aria-hidden', 'true');

    image.style.width = '30px';
    image.style.height = '30px';
    image.style.objectFit = 'contain';
    image.style.verticalAlign = 'middle';

    return image;

}


function updateLibrarySubtitle() {

    const subtitle =
        document.getElementById(
            'library-subtitle'
        );

    if (!subtitle) {
        return;
    }

    const library =
        libraries[activeLibraryKey];

    subtitle.innerHTML = '';

    subtitle.style.display = 'flex';
    subtitle.style.alignItems = 'center';
    subtitle.style.justifyContent = 'center';
    subtitle.style.gap = '5px';
    subtitle.style.flexWrap = 'wrap';
    subtitle.style.width = '100%';
    subtitle.style.fontWeight = 'bold';
    subtitle.style.fontSize = '1.08rem';
    subtitle.style.color = '#4a3022';

    const title =
        document.createElement('span');

    title.textContent =
        library ? library.title : '';

    title.style.marginRight = '8px';

    subtitle.appendChild(title);

    const pieces =
        getLibraryPieceTypes();

    pieces.white.forEach(piece => {

        subtitle.appendChild(
            createSubtitlePiece(
                'w',
                piece
            )
        );

    });

    if (
        pieces.white.length > 0 &&
        pieces.black.length > 0
    ) {

        const versus =
            document.createElement('span');

        versus.textContent = 'vs';
        versus.style.margin = '0 5px';

        subtitle.appendChild(versus);

    }

    pieces.black.forEach(piece => {

        subtitle.appendChild(
            createSubtitlePiece(
                'b',
                piece
            )
        );

    });

}


function setupLibraryPresentation() {

    const select =
        document.getElementById(
            'library-select'
        );

    if (!select) {
        return;
    }

    select.style.display = 'none';

    const label =
        document.querySelector(
            'label[for="library-select"]'
        );

    if (label) {
        label.style.display = 'none';
    }

    let subtitle =
        document.getElementById(
            'library-subtitle'
        );

    if (!subtitle) {

        subtitle =
            document.createElement('div');

        subtitle.id =
            'library-subtitle';

        const positionSelect =
    document.getElementById(
        'position-select'
    );

if (
    positionSelect &&
    positionSelect.parentNode
) {

    positionSelect.parentNode.insertBefore(
        subtitle,
        positionSelect
    );

}

    }

    updateLibrarySubtitle();

}


// ==================================================
// IMAGE STOCKFISH
// ==================================================

function setupStockfishImage() {

    const fish =
        document.querySelector(
            '.stockfish-fish'
        );


    if (!fish) {

        return;

    }


    fish.innerHTML =
        '';


    const image =
        document.createElement(
            'img'
        );


    image.src =
        './images/stockfish.svg';


    image.alt =
        'Stockfish';


    image.className =
        'stockfish-image';


    fish.appendChild(
        image
    );

}


// ==================================================
// AFFICHAGE DE L'ÉVALUATION
// ==================================================

function renderEvaluation() {

    const element =
        document.getElementById(
            'evaluation'
        );


    if (!element) {

        return;

    }


    if (!evaluationVisible) {

        element.textContent =
            '—';

        return;

    }


    element.textContent =
        latestEvaluation;

}


// ==================================================
// ENREGISTRER UNE ÉVALUATION
// ==================================================

function setEvaluation(
    value
) {

    if (

        value === undefined ||

        value === null ||

        value === ''

    ) {

        latestEvaluation =
            '—';

    }

    else {

        latestEvaluation =
            value;

    }


    renderEvaluation();

}


// ==================================================
// RÉINITIALISER L'ÉVALUATION
// ==================================================

function resetEvaluation() {

    latestEvaluation =
        '—';


    renderEvaluation();

}


// ==================================================
// CONVERTIR UNE INFO STOCKFISH
// ==================================================

function updateEvaluationFromInfo(
    message
) {

    if (
        !evaluationVisible
    ) {

        return;

    }


    if (
        !message.startsWith(
            'info'
        )
    ) {

        return;

    }


// NOUVEAU : Stockfish donne toujours le score du
    // point de vue du camp au trait (convention UCI).
    // On calcule un facteur pour ramener ce score au
    // point de vue des Blancs, quel que soit le trait.

    const perspective =
        game.turn() === 'w'
            ? 1
            : -1;





    const mateMatch =
        message.match(
            /\bscore\s+mate\s+(-?\d+)/
        );


    if (mateMatch) {

        const distance =
            perspective *
            parseInt(
                mateMatch[1],
                10
            );


        let text;


        if (
            distance < 0
        ) {

            text =
                '#-' +
                Math.abs(distance);

        }

        else {

            text =
                '#' +
                Math.abs(distance);

        }


        setEvaluation(
            text
        );

        return;

    }


    const cpMatch =
        message.match(
            /\bscore\s+cp\s+(-?\d+)/
        );


    if (!cpMatch) {

        return;

    }


     const centipawns =
        perspective *
        parseInt(
            cpMatch[1],
            10
        );


    const pawns =
        centipawns / 100;


    let text =
        pawns.toFixed(2);


    if (
        pawns > 0
    ) {

        text =
            '+' + text;

    }


    if (
        pawns === 0
    ) {

        text =
            '0.00';

    }


    setEvaluation(
        text
    );

}


// ==================================================
// TABLES DE FINALES — OUTILS
// ==================================================

function countPiecesInFen(
    fen
) {

    const board =
        fen.split(' ')[0];


    let count = 0;


    for (
        const character
        of board
    ) {

        if (
            /[prnbqkPRNBQK]/.test(
                character
            )
        ) {

            count++;

        }

    }


    return count;

}


function tablebaseWinnerToEvaluation(
    winner
) {

    if (
        winner === 'w'
    ) {

        return 'white';

    }


    if (
        winner === 'b'
    ) {

        return 'black';

    }


    return null;

}


function formatTablebaseMate(
    winner,
    plies
) {

    const mateDistance =
        Math.max(
            1,
            Math.ceil(
                Math.abs(plies) / 2
            )
        );


    return (
        winner === 'black'
            ? '#-' + mateDistance
            : '#' + mateDistance
    );

}


async function fetchTablebaseJson(
    fen,
    signal
) {

    const response =
        await fetch(
            TABLEBASE_ENDPOINT +
            '?fen=' +
            encodeURIComponent(fen),
            {
                signal
            }
        );


    if (
        !response.ok
    ) {

        throw new Error(
            'Tablebase unavailable: ' +
            response.status
        );

    }


    return response.json();

}


async function getTablebaseMainlineMate(
    fen,
    winner,
    signal
) {

    const response =
        await fetch(
            TABLEBASE_ENDPOINT +
            '/mainline?fen=' +
            encodeURIComponent(fen),
            {
                signal
            }
        );


    if (
        !response.ok
    ) {

        return null;

    }


    const data =
        await response.json();


    if (
        !data ||
        !Array.isArray(data.mainline) ||
        data.mainline.length === 0
    ) {

        return null;

    }


    const lineWinner =
        tablebaseWinnerToEvaluation(
            data.winner
        ) || winner;


    if (!lineWinner) {

        return null;

    }


    const replay =
        new Chess();


    if (
        !replay.load(fen)
    ) {

        return null;

    }


    for (
        const entry
        of data.mainline
    ) {

        if (
            signal.aborted
        ) {

            return null;

        }


        const uci =
            entry.uci;


        if (
            !uci ||
            uci.length < 4
        ) {

            return null;

        }


        const move =
            replay.move({
                from:
                    uci.slice(0, 2),
                to:
                    uci.slice(2, 4),
                promotion:
                    uci.length > 4
                        ? uci.slice(4, 5)
                        : undefined
            });


        if (!move) {

            return null;

        }

    }


    /*
       La ligne principale n'est utilisée que si
       elle aboutit réellement à un mat. Une ligne
       interrompue pour la règle des 50 coups ne doit
       jamais être transformée en #n.
    */
    if (
        !replay.game_over() ||
        !replay.in_checkmate()
    ) {

        return null;

    }


    return formatTablebaseMate(
        lineWinner,
        data.mainline.length
    );

}


// ==================================================
// DEMANDER UNE ÉVALUATION TABLEBASE
// ==================================================

async function requestTablebaseEvaluation(
    fen,
    requestId
) {

    if (
        !evaluationVisible ||
        requestId !== evaluationSearchId
    ) {

        return false;

    }


    if (
        countPiecesInFen(fen) >
        TABLEBASE_MAX_PIECES
    ) {

        return false;

    }


    const controller =
        new AbortController();


    try {

        const data =
            await fetchTablebaseJson(
                fen,
                controller.signal
            );


        if (
            !evaluationVisible ||
            requestId !== evaluationSearchId ||
            game.fen() !== fen
        ) {

            return true;

        }


        if (
            data.checkmate
        ) {

            const winner =
                game.turn() === 'w'
                    ? 'black'
                    : 'white';


            setEvaluation(
                formatTablebaseMate(
                    winner,
                    0
                )
            );


            return true;

        }


        if (
            data.stalemate ||
            data.category === 'draw'
        ) {

            setEvaluation(
                '0.00'
            );


            return true;

        }


        const category =
            String(
                data.category || ''
            ).toLowerCase();


        const decisive =
            category === 'win' ||
            category === 'loss' ||
            category === 'syzygy-win' ||
            category === 'syzygy-loss' ||
            category === 'maybe-win' ||
            category === 'maybe-loss' ||
            category === 'cursed-win' ||
            category === 'blessed-loss';


        if (!decisive) {

            return false;

        }


        /*
           Dans l'API Lichess, le signe de dtm est
           relatif au camp au trait. Le camp gagnant
           est donc déduit de ce signe.
        */
        if (
            Number.isFinite(
                data.dtm
            ) &&
            data.dtm !== 0
        ) {

            const sideToMove =
                fen.split(' ')[1];


            const winner =
                data.dtm > 0
                    ? (
                        sideToMove === 'w'
                            ? 'white'
                            : 'black'
                    )
                    : (
                        sideToMove === 'w'
                            ? 'black'
                            : 'white'
                    );


            setEvaluation(
                formatTablebaseMate(
                    winner,
                    data.dtm
                )
            );


            return true;

        }


        /*
           Si le DTM n'est pas fourni, on suit la
           ligne principale des tables. Elle ne remplace
           l'évaluation que lorsqu'elle aboutit réellement
           à un mat.
        */
        const winner =
            category.includes('win')
                ? (
                    fen.split(' ')[1] === 'w'
                        ? 'white'
                        : 'black'
                )
                : (
                    fen.split(' ')[1] === 'w'
                        ? 'black'
                        : 'white'
                );


        const mateText =
            await getTablebaseMainlineMate(
                fen,
                winner,
                controller.signal
            );


        if (
            !evaluationVisible ||
            requestId !== evaluationSearchId ||
            game.fen() !== fen
        ) {

            return true;

        }


        if (mateText) {

            setEvaluation(
                mateText
            );


            return true;

        }


        /*
           La position est néanmoins couverte et son
           résultat est théoriquement décisif. On ne
           laisse donc pas Stockfish remplacer les tables
           par une évaluation approximative.
        */
        setEvaluation(
            winner === 'black'
                ? '#?'
                : '#?'
        );


        return true;

    }

    catch (error) {

        /*
           Hors tables, réponse 404, réseau indisponible :
           Stockfish reste simplement l'évaluation de secours.
        */
        return false;

    }

}


// ==================================================
// DEMANDER UNE ÉVALUATION
// ==================================================

function requestEvaluation() {

    if (
        !evaluationVisible
    ) {

        return;

    }


    if (
        thinking
    ) {

        return;

    }


    evaluatingPosition =
        true;


    evaluationSearchId++;


    const requestId =
        evaluationSearchId;


    latestEvaluation =
        '—';


    renderEvaluation();


    const depth =
        parseInt(

            document
                .getElementById(
                    'depth'
                )
                .value,

            10

        ) || 20;


    const fen =
        game.fen();


    stockfish.postMessage(
        'stop'
    );


    /*
       Les tables sont interrogées en premier.
       Si elles donnent une réponse exploitable,
       Stockfish n'écrase pas ce résultat exact.
    */
    requestTablebaseEvaluation(
        fen,
        requestId
    )
        .then(
            handled => {

                if (
                    requestId !== evaluationSearchId
                ) {

                    return;

                }


                evaluatingPosition =
                    false;


                if (handled) {

                    stockfish.postMessage(
                        'stop'
                    );


                    return;

                }


                if (
                    !evaluationVisible ||
                    thinking ||
                    game.fen() !== fen
                ) {

                    return;

                }


                evaluatingPosition =
                    true;


                stockfish.postMessage(
                    'stop'
                );


                stockfish.postMessage(
                    'position fen ' +
                    fen
                );


                stockfish.postMessage(
                    'go depth ' +
                    depth
                );

            }
        );

}


// ==================================================
// COULEUR DU JOUEUR
// ==================================================

function playerColor() {

    if (
        isAnalysisMode()
    ) {

        return 'both';

    }


    return playerSide;

}


// ==================================================
// TOUR DU JOUEUR
// ==================================================

function isPlayerTurn() {

    if (
        isAnalysisMode()
    ) {

        return true;

    }


    if (
        playerSide === 'white'
    ) {

        return game.turn() === 'w';

    }


    return game.turn() === 'b';

}


// ==================================================
// COUPS LÉGAUX
// ==================================================

function getDests() {

    const dests =
        new Map();


    for (
        const square
        of SQUARES
    ) {

        const moves =
            game.moves({

                square:
                    square,

                verbose:
                    true

            });


        if (
            moves.length > 0
        ) {

            dests.set(

                square,

                moves.map(
                    move =>
                        move.to
                )

            );

        }

    }


    return dests;

}


// ==================================================
// ÉCHIQUIER
// ==================================================

const boardElement =
    document.getElementById(
        'board'
    );


const ground =
    Chessground(

        boardElement,

        {

            fen:
                game.fen(),

            orientation:
                'white',

            coordinates:
                false,

            movable: {

                free:
                    false,

                color:
                    'white',

                dests:
                    getDests(),

                events: {

                    after:
                        playerMove

                }

            }

        }

    );


// ==================================================
// INDICATEURS DE TRAIT
// ==================================================

function updateTurnIndicators() {

    const whiteCircle =
        document.getElementById(
            'turn-white'
        );


    const blackCircle =
        document.getElementById(
            'turn-black'
        );


    if (

        !whiteCircle ||

        !blackCircle ||

        !boardElement

    ) {

        return;

    }


    const boardSize =
        boardElement.clientWidth;


    if (
        boardSize <= 0
    ) {

        return;

    }


    /*
       Une case = côté de l'échiquier / 8.

       Le cercle doit avoir un diamètre
       égal à la moitié d'une case.
    */

    const squareSize =
        boardSize / 8;


    const circleSize =
        squareSize / 2;

    /*
       Espace entre l'échiquier et le cercle
       = 1/5 de la largeur d'une case.
    */
    const turnIndicators =
        document.querySelector(
            '.turn-indicators'
        );

    if (turnIndicators) {

        turnIndicators.style.marginLeft =
            (
                squareSize / 5
            ) + 'px';

        turnIndicators.style.width =
            circleSize + 'px';

    }


    whiteCircle.style.width =
        circleSize + 'px';


    whiteCircle.style.height =
        circleSize + 'px';


    blackCircle.style.width =
        circleSize + 'px';


    blackCircle.style.height =
        circleSize + 'px';


    /*
       Centre vertical du cercle
       aligné sur le centre de la première
       ou de la dernière rangée visible.
    */

    const firstRankCenter =
        squareSize / 2;


    const lastRankCenter =
        boardSize -
        squareSize / 2;


    /*
       Position du centre du cercle.
    */

    function setCirclePosition(
        circle,
        centerY
    ) {

        circle.style.top =
            (
                centerY -
                circleSize / 2
            ) + 'px';


        circle.style.bottom =
            'auto';

    }


    /*
       En orientation blanche :

       rangée 8 = en haut
       rangée 1 = en bas

       En orientation noire :

       rangée 1 = en haut
       rangée 8 = en bas
    */

    const orientation =
        ground.state.orientation;


    if (
        orientation === 'white'
    ) {

        setCirclePosition(
            whiteCircle,
            lastRankCenter
        );


        setCirclePosition(
            blackCircle,
            firstRankCenter
        );

    }

    else {

        setCirclePosition(
            whiteCircle,
            firstRankCenter
        );


        setCirclePosition(
            blackCircle,
            lastRankCenter
        );

    }


    /*
       Un seul indicateur est affiché :
       celui du camp au trait.
    */

    if (
        game.turn() === 'w'
    ) {

        whiteCircle.classList.add(
            'active'
        );


        blackCircle.classList.remove(
            'active'
        );

    }

    else {

        blackCircle.classList.add(
            'active'
        );


        whiteCircle.classList.remove(
            'active'
        );

    }

}


// ==================================================
// COORDONNÉES EXTÉRIEURES
// ==================================================

function updateCoordinates() {

    const rankLabels =
        document.querySelector(
            '.rank-labels'
        );


    const fileLabels =
        document.querySelector(
            '.file-labels'
        );


    if (

        !rankLabels ||

        !fileLabels

    ) {

        return;

    }


    if (
        ground.state.orientation ===
        'white'
    ) {

        rankLabels.innerHTML = `

            <span>8</span>
            <span>7</span>
            <span>6</span>
            <span>5</span>
            <span>4</span>
            <span>3</span>
            <span>2</span>
            <span>1</span>

        `;


        fileLabels.innerHTML = `

            <span>a</span>
            <span>b</span>
            <span>c</span>
            <span>d</span>
            <span>e</span>
            <span>f</span>
            <span>g</span>
            <span>h</span>

        `;

    }

    else {

        rankLabels.innerHTML = `

            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
            <span>6</span>
            <span>7</span>
            <span>8</span>

        `;


        fileLabels.innerHTML = `

            <span>h</span>
            <span>g</span>
            <span>f</span>
            <span>e</span>
            <span>d</span>
            <span>c</span>
            <span>b</span>
            <span>a</span>

        `;

    }


    requestAnimationFrame(
        updateTurnIndicators
    );

}


// ==================================================
// STOCKFISH — RÉCEPTION
// ==================================================

stockfish.onmessage =
    function(event) {

        const message =
            event.data;


        updateEvaluationFromInfo(
            message
        );


        if (
            message.startsWith(
                'bestmove'
            )
        ) {

            if (
                evaluatingPosition
            ) {

                evaluatingPosition =
                    false;

                return;

            }


            const parts =
                message
                    .trim()
                    .split(/\s+/);


            const bestMove =
                parts[1];


            if (

                bestMove &&

                bestMove !== '(none)'

            ) {

                playStockfishMove(
                    bestMove
                );

            }

        }

    };


stockfish.postMessage(
    'uci'
);


// ==================================================
// CRÉER UN NŒUD
// ==================================================

function createNode(
    parent,
    move,
    source
) {

    return {

        parent:
            parent,

        move: {

            color:
                move.color,

            from:
                move.from,

            to:
                move.to,

            san:
                move.san,

            promotion:
                move.promotion || null

        },

        source:
            source,

        children:
            [],

        fen:
            game.fen(),

        selectedChild:
            null,

        comment:
            null

    };

}


// ==================================================
// CHERCHER UN ENFANT EXISTANT
// ==================================================

function findChild(
    node,
    move
) {

    return node.children.find(

        child =>

            child.move.from ===
                move.from &&

            child.move.to ===
                move.to &&

            (
                child.move.promotion ||
                null
            ) ===
            (
                move.promotion ||
                null
            )

    );

}


// ==================================================
// CHEMIN DEPUIS LA RACINE
// ==================================================

function getPath(
    node
) {

    const path = [];

    let current =
        node;


    while (

        current &&

        current.parent

    ) {

        path.unshift(
            current
        );


        current =
            current.parent;

    }


    return path;

}


// ==================================================
// RECONSTRUIRE LA POSITION
// ==================================================

function rebuildGameToNode(
    node
) {

    const loaded =
        game.load(
            currentStartFen
        );


    if (
        !loaded
    ) {

        console.error(
            'Impossible de charger la position initiale.'
        );

        return false;

    }


    const path =
        getPath(
            node
        );


    for (
        const child
        of path
    ) {

        const move =
            game.move({

                from:
                    child.move.from,

                to:
                    child.move.to,

                promotion:
                    child.move.promotion ||
                    'q'

            });


        if (
            !move
        ) {

            console.error(
                'Impossible de reconstruire :',
                child.move.san
            );

            return false;

        }

    }


    return true;

}


// ==================================================
// AFFICHER UN NŒUD
// ==================================================

function showNode(
    node
) {

    cancelPromotion();


    stockfish.postMessage(
        'stop'
    );


    thinking =
        false;


    evaluatingPosition =
        false;


    searchId++;


    evaluationSearchId++;


    resetEvaluation();


    if (
        !rebuildGameToNode(
            node
        )
    ) {

        return;

    }


    currentNode =
        node;


    ground.set({

        lastMove:
            getLastMoveSquares(),

        fen:
            game.fen(),

        turnColor:

            game.turn() === 'w'
                ? 'white'
                : 'black',

        movable: {

            color:
                playerColor(),

            dests:

                isPlayerTurn()
                    ? getDests()
                    : new Map()

        }

    });


    updateMoves();

    updateNavigation();

    updateTurnIndicators();


    if (

        node.children.length > 0 &&

        node !== rootNode

    ) {

        document
            .getElementById(
                'status'
            )
            .textContent =
                'Position précédente — choisissez une suite';

    }

    else if (
        game.game_over()
    ) {

        document
            .getElementById(
                'status'
            )
            .textContent =
                (
                    currentNode &&
                    currentNode.comment
                ) ||
                getGameTerminationComment();

    }

    else if (
        isAnalysisMode()
    ) {

        document
            .getElementById(
                'status'
            )
            .textContent =
                'Mode analyse';

    }

    else {

        document
            .getElementById(
                'status'
            )
            .textContent =

                isPlayerTurn()
                    ? 'À vous de jouer'
                    : 'Stockfish va jouer';

    }


    if (
        evaluationVisible
    ) {

        requestEvaluation();

    }


    /*
       Si le nœud affiché est au tour du camp géré
       par Stockfish, le moteur doit immédiatement
       reprendre la main, y compris après un changement
       de couleur ou un clic dans une variante.
    */
    if (
        !game.game_over() &&
        !isAnalysisMode() &&
        !isPlayerTurn()
    ) {

        askStockfish();

    }

}


// ==================================================
// ACTIVER LE JOUEUR
// ==================================================

function enablePlayer() {

    thinking =
        false;


    ground.set({

        lastMove:
            getLastMoveSquares(),

        fen:
            game.fen(),

        turnColor:

            game.turn() === 'w'
                ? 'white'
                : 'black',

        movable: {

            color:
                playerColor(),

            dests:

                isPlayerTurn()
                    ? getDests()
                    : new Map()

        }

    });


    updateTurnIndicators();


    if (
        isAnalysisMode()
    ) {

        document
            .getElementById(
                'status'
            )
            .textContent =
                'Mode analyse';

    }

    else {

        document
            .getElementById(
                'status'
            )
            .textContent =

                isPlayerTurn()
                    ? 'À vous de jouer'
                    : 'Stockfish va jouer';

    }

}


// ==================================================
// BLOQUER LE JOUEUR
// ==================================================

function disablePlayer() {

    ground.set({

        lastMove:
            getLastMoveSquares(),

        movable: {

            color:
                playerColor(),

            dests:
                new Map()

        }

    });

}


// ==================================================
// TEST D'UNE PROMOTION
// ==================================================

function isPromotionMove(
    from,
    to
) {

    const piece =
        game.get(
            from
        );


    if (

        !piece ||

        piece.type !== 'p'

    ) {

        return false;

    }


    return (

        to.charAt(1) === '8' ||

        to.charAt(1) === '1'

    );

}


// ==================================================
// AFFICHER LE CHOIX DE PROMOTION
// ==================================================

function showPromotionChoice(
    from,
    to
) {

    pendingPromotion = {

        from:
            from,

        to:
            to,

        color:
            game.turn()

    };


    disablePlayer();


    const modal =
        document.getElementById(
            'promotion-modal'
        );


    const choices =
        document.getElementById(
            'promotion-choices'
        );


    if (

        !modal ||

        !choices

    ) {

        console.error(
            'Fenêtre de promotion introuvable.'
        );

        return;

    }


    choices.innerHTML =
        '';


    const pieces = [

        {
            type: 'q',
            title: 'Dame'
        },

        {
            type: 'r',
            title: 'Tour'
        },

        {
            type: 'b',
            title: 'Fou'
        },

        {
            type: 'n',
            title: 'Cavalier'
        }

    ];


    for (
        const piece
        of pieces
    ) {

        const button =
            document.createElement(
                'button'
            );


        button.type =
            'button';


        button.className =
            'promotion-piece';


        button.title =
            piece.title;


        button.setAttribute(

            'aria-label',

            piece.title

        );


        const image =
            document.createElement(
                'img'
            );


        const color =
            pendingPromotion.color === 'w'
                ? 'w'
                : 'b';


        const letter =
            piece.type.toUpperCase();


        image.src =
            './pieces/alpha/' +
            color +
            letter +
            '.svg';


        image.alt =
            piece.title;


        button.appendChild(
            image
        );


        button.addEventListener(

            'click',

            () => {

                completePromotion(
                    piece.type
                );

            }

        );


        choices.appendChild(
            button
        );

    }


    modal.hidden =
        false;


    modal.setAttribute(

        'aria-hidden',

        'false'

    );

}


// ==================================================
// ANNULER UNE PROMOTION
// ==================================================

function cancelPromotion() {

    pendingPromotion =
        null;


    const modal =
        document.getElementById(
            'promotion-modal'
        );


    if (modal) {

        modal.hidden =
            true;


        modal.setAttribute(

            'aria-hidden',

            'true'

        );

    }


    const choices =
        document.getElementById(
            'promotion-choices'
        );


    if (choices) {

        choices.innerHTML =
            '';

    }

}


// ==================================================
// TERMINER UNE PROMOTION
// ==================================================

function completePromotion(
    promotion
) {

    if (
        !pendingPromotion
    ) {

        return;

    }


    const from =
        pendingPromotion.from;


    const to =
        pendingPromotion.to;


    cancelPromotion();


    ground.set({

        lastMove:
            getLastMoveSquares(),

        fen:
            game.fen()

    });


    const move =
        game.move({

            from:
                from,

            to:
                to,

            promotion:
                promotion

        });


    if (
        !move
    ) {

        console.error(
            'Promotion refusée :',
            from,
            to,
            promotion
        );


        ground.set({

        lastMove:
            getLastMoveSquares(),

            fen:
                game.fen(),

            movable: {

                color:
                    playerColor(),

                dests:
                    getDests()

            }

        });


        return;

    }


    finishPlayerMove(
        move
    );

}


// ==================================================
// COUP DU JOUEUR
// ==================================================

function playerMove(
    orig,
    dest
) {

    if (

        thinking ||

        pendingPromotion

    ) {

        return;

    }


    if (
        !isPlayerTurn()
    ) {

        return;

    }


    if (
        isPromotionMove(
            orig,
            dest
        )
    ) {

        showPromotionChoice(
            orig,
            dest
        );

        return;

    }


    const move =
        game.move({

            from:
                orig,

            to:
                dest

        });


    if (
        !move
    ) {

        ground.set({

        lastMove:
            getLastMoveSquares(),

            fen:
                game.fen(),

            movable: {

                color:
                    playerColor(),

                dests:
                    getDests()

            }

        });

        return;

    }


    finishPlayerMove(
        move
    );

}


// ==================================================
// TERMINER UN COUP DU JOUEUR
// ==================================================

function finishPlayerMove(
    move
) {

    let child =
        findChild(

            currentNode,

            move

        );


    if (
        !child
    ) {

        child =
            createNode(

                currentNode,

                move,

                isAnalysisMode()
                    ? 'analysis'
                    : 'player'

            );


        currentNode.children.push(
            child
        );

    }


    currentNode.selectedChild =
        child;


    currentNode =
        child;


    child.fen =
        game.fen();


    resetEvaluation();


    ground.set({

        lastMove:
            getLastMoveSquares(),

        fen:
            game.fen(),

        turnColor:

            game.turn() === 'w'
                ? 'white'
                : 'black',

        movable: {

            color:
                playerColor(),

            dests:
                new Map()

        }

    });


    updateMoves();

    updateNavigation();

    updateTurnIndicators();


    if (
        game.game_over()
    ) {

        const terminationComment =
            getGameTerminationComment();


        if (
            currentNode
        ) {

            currentNode.comment =
                terminationComment;

        }


        updateMoves();


        document
            .getElementById(
                'status'
            )
            .textContent =
                terminationComment;

        return;

    }


    /*
       En mode analyse,
       on ne demande jamais à Stockfish
       de jouer un coup.

       Le joueur peut immédiatement
       jouer le coup suivant,
       quelle que soit sa couleur.
    */

    if (
        isAnalysisMode()
    ) {

        enablePlayer();


        if (
            evaluationVisible
        ) {

            requestEvaluation();

        }


        return;

    }


    askStockfish();

}


// ==================================================
// TABLES DE FINALES — CHOIX DU COUP EN MODE JEU
// ==================================================

function findImmediateCheckmateMove() {

    const legalMoves =
        game.moves({
            verbose: true
        });


    for (
        const candidate
        of legalMoves
    ) {

        const replay =
            new Chess();


        if (
            !replay.load(
                game.fen()
            )
        ) {

            continue;
        }


        const move =
            replay.move({
                from:
                    candidate.from,

                to:
                    candidate.to,

                promotion:
                    candidate.promotion
            });


        if (
            move &&
            replay.in_checkmate &&
            replay.in_checkmate()
        ) {

            return (
                candidate.from +
                candidate.to +
                (
                    candidate.promotion ||
                    ''
                )
            );
        }
    }


    return null;
}


async function getTablebaseBestMove(
    fen
) {

    if (
        countPiecesInFen(fen) >
        TABLEBASE_MAX_PIECES
    ) {

        return null;
    }


    try {

        /*
           La ligne principale fournie par Lichess
           est la ligne optimale des tables. Son premier
           coup est donc le coup exact à jouer.

           Ce choix est effectué avant Stockfish afin que
           les positions couvertes par les tables soient
           jouées avec la résistance théorique maximale.
        */
        const response =
            await fetch(
                TABLEBASE_ENDPOINT +
                '/mainline?fen=' +
                encodeURIComponent(fen)
            );


        if (
            response.ok
        ) {

            const data =
                await response.json();


            if (
                data &&
                Array.isArray(
                    data.mainline
                ) &&
                data.mainline.length > 0 &&
                data.mainline[0].uci
            ) {

                return data.mainline[0].uci;
            }
        }


        /*
           Solution de secours : l'endpoint standard
           renvoie également les coups des tables.
        */
        const data =
            await fetchTablebaseJson(
                fen
            );


        if (
            data &&
            Array.isArray(
                data.moves
            ) &&
            data.moves.length > 0
        ) {

            const firstMove =
                data.moves.find(
                    move =>
                        move &&
                        move.uci
                );


            if (firstMove) {

                return firstMove.uci;
            }
        }
    }

    catch (error) {

        /*
           Hors ligne, position non couverte ou erreur
           de l'API : Stockfish prend le relais.
        */
    }


    return null;
}


// ==================================================
// DEMANDER À STOCKFISH
// ==================================================

function askStockfish() {

    if (
        isAnalysisMode()
    ) {

        enablePlayer();

        return;
    }


    thinking =
        true;

    evaluatingPosition =
        false;

    disablePlayer();


    document
        .getElementById(
            'status'
        )
        .textContent =
        'Recherche du meilleur coup…';


    const fen =
        game.fen();


    const depth =
        parseInt(

            document
                .getElementById(
                    'depth'
                )
                .value,

            10

        ) || 20;


    stockfish.postMessage(
        'stop'
    );


    /*
       Priorité absolue au mat immédiat.
       Cela évite le cas où la position affiche #1
       mais où un autre coup est joué.
    */
    const immediateMate =
        findImmediateCheckmateMove();


    if (immediateMate) {

        playStockfishMove(
            immediateMate
        );

        return;
    }


    /*
       Dans les positions couvertes par les tables,
       on joue le coup exact de la ligne principale
       avant d'utiliser Stockfish.
    */
    getTablebaseBestMove(
        fen
    )
        .then(
            tablebaseMove => {

                if (
                    !thinking ||
                    game.fen() !== fen
                ) {

                    return;
                }


                if (tablebaseMove) {

                    document
                        .getElementById(
                            'status'
                        )
                        .textContent =
                        'Coup des tables de finales…';


                    playStockfishMove(
                        tablebaseMove
                    );

                    return;
                }


                document
                    .getElementById(
                        'status'
                    )
                    .textContent =
                    'Stockfish réfléchit…';


                searchId++;


                stockfish.postMessage(
                    'position fen ' +
                    fen
                );


                stockfish.postMessage(
                    'go depth ' +
                    depth
                );
            }
        )
        .catch(
            () => {

                if (
                    !thinking ||
                    game.fen() !== fen
                ) {

                    return;
                }


                document
                    .getElementById(
                        'status'
                    )
                    .textContent =
                    'Stockfish réfléchit…';


                searchId++;


                stockfish.postMessage(
                    'position fen ' +
                    fen
                );


                stockfish.postMessage(
                    'go depth ' +
                    depth
                );
            }
        );
}


// ==================================================
// COUP DE STOCKFISH
// ==================================================

function playStockfishMove(
    moveString
) {

    if (
        !thinking
    ) {

        return;

    }


    if (
        isAnalysisMode()
    ) {

        thinking =
            false;

        return;

    }


    const from =
        moveString.substring(
            0,
            2
        );


    const to =
        moveString.substring(
            2,
            4
        );


    let promotion =
        undefined;


    if (
        moveString.length >= 5
    ) {

        promotion =
            moveString.substring(
                4,
                5
            );

    }


    const move =
        game.move({

            from:
                from,

            to:
                to,

            promotion:
                promotion

        });


    if (
        !move
    ) {

        thinking =
            false;

        enablePlayer();

        return;

    }


    let child =
        findChild(

            currentNode,

            move

        );


    if (
        !child
    ) {

        child =
            createNode(

                currentNode,

                move,

                'stockfish'

            );


        currentNode.children.push(
            child
        );

    }


    currentNode.selectedChild =
        child;


    currentNode =
        child;


    child.fen =
        game.fen();


    thinking =
        false;


    ground.set({

        lastMove:
            getLastMoveSquares(),

        fen:
            game.fen(),

        turnColor:

            game.turn() === 'w'
                ? 'white'
                : 'black',

        movable: {

            color:
                playerColor(),

            dests:

                isPlayerTurn()
                    ? getDests()
                    : new Map()

        }

    });


    updateMoves();

    updateNavigation();

    updateTurnIndicators();


    if (
        game.game_over()
    ) {

        const terminationComment =
            getGameTerminationComment();


        if (
            currentNode
        ) {

            currentNode.comment =
                terminationComment;

        }


        updateMoves();


        document
            .getElementById(
                'status'
            )
            .textContent =
                terminationComment;

        return;

    }


    enablePlayer();


    if (
        evaluationVisible
    ) {

        requestEvaluation();

    }

}


// ==================================================
// NOTATION
// ==================================================

function convertSan(
    san,
    color
) {

    const mode =
        document
            .getElementById(
                'notation'
            )
            .value;


    if (
        mode === 'international'
    ) {

        return san;

    }


    if (
        mode === 'french'
    ) {

        const conversion = {

            K: 'R',

            Q: 'D',

            R: 'T',

            B: 'F',

            N: 'C'

        };


        let result =
            san;


        if (
            conversion[
                result.charAt(0)
            ]
        ) {

            result =

                conversion[
                    result.charAt(0)
                ] +

                result.substring(1);

        }


        result =
            result.replace(
                /=Q/g,
                '=D'
            );


        result =
            result.replace(
                /=R/g,
                '=T'
            );


        result =
            result.replace(
                /=B/g,
                '=F'
            );


        result =
            result.replace(
                /=N/g,
                '=C'
            );


        return result;

    }


    if (
        mode === 'figurines'
    ) {

        /*
           En notation « figurines », on utilise directement
           les SVG Alpha déjà employés sur l’échiquier.
           Cela garantit une parfaite cohérence graphique et
           évite toute dépendance à une police externe.
        */

        const pieceImages = {

            K:
                'wK.svg',

            Q:
                'wQ.svg',

            R:
                'wR.svg',

            B:
                'wB.svg',

            N:
                'wN.svg'

        };


        const oppositeImages = {

            K:
                'bK.svg',

            Q:
                'bQ.svg',

            R:
                'bR.svg',

            B:
                'bB.svg',

            N:
                'bN.svg'

        };


        const images =
            color === 'white'
                ? pieceImages
                : oppositeImages;


        const makePiece =
            piece =>
                '<img class="notation-piece" src="./pieces/alpha/' +
                images[piece] +
                '" alt="' +
                piece +
                '">';


        let result =
            String(san);


        const first =
            result.charAt(0);


        if (
            images[first]
        ) {

            result =

                makePiece(first) +

                result.substring(1);

        }


        result =
            result.replace(

                /=([QRBN])/g,

                (
                    match,
                    piece
                ) =>

                    '=' +

                    makePiece(piece)

            );


        return result;

    }


    return san;

}


// ==================================================
// BRANCHE PRINCIPALE
// ==================================================

function getMainChild(
    node
) {

    if (

        !node ||

        node.children.length === 0

    ) {

        return null;

    }


    return node.children[0];

}


// ==================================================
// INFORMATION POSITION INITIALE
// ==================================================

function getStartMoveInfo() {

    const parts =
        currentStartFen
            .trim()
            .split(/\s+/);


    return {

        turn:
            parts[1] || 'w',

        fullmove:

            parseInt(

                parts[5] || '1',

                10

            ) || 1

    };

}


// ==================================================
// NUMÉRO RÉEL D'UN COUP
// ==================================================

function getMoveNumber(
    node
) {

    const path =
        getPath(
            node
        );


    const index =
        path.length - 1;


    const start =
        getStartMoveInfo();


    if (
        start.turn === 'w'
    ) {

        return (

            start.fullmove +

            Math.floor(
                index / 2
            )

        );

    }


    return (

        start.fullmove +

        Math.floor(
            (index + 1) / 2
        )

    );

}


// ==================================================
// BOUTON D'UN COUP
// ==================================================

function createMoveButton(
    node,
    mainLine
) {

    const button =
        document.createElement(
            'button'
        );


    button.className =
        'move-text';


    if (
        mainLine
    ) {

        button.classList.add(
            'main-move'
        );

    }

    else {

        button.classList.add(
            'variation-move'
        );

    }


    if (
        node === currentNode
    ) {

        button.classList.add(
            'current-move'
        );

    }


    if (
        document
            .getElementById(
                'notation'
            )
            .value === 'figurines'
    ) {

        button.classList.add(
            'figurine-notation'
        );

        /*
           La taille du texte de la notation reste exactement
           celle des autres coups et des numéros de coups.
           Seules les petites images SVG sont ajustées par le CSS.
        */
        button.style.fontSize = '';
        button.style.lineHeight = '';

    }


    const convertedSan =
        convertSan(

            node.move.san,

            node.move.color === 'w'
                ? 'white'
                : 'black'

        );


    if (
        document
            .getElementById(
                'notation'
            )
            .value === 'figurines'
    ) {

        button.innerHTML =
            convertedSan;

    }

    else {

        button.textContent =
            convertedSan;

    }


    button.addEventListener(

        'click',

        () => {

            showNode(
                node
            );

        }

    );


    return button;

}


// ==================================================
// ESPACE
// ==================================================

function addSpace(
    container
) {

    container.appendChild(

        document.createTextNode(
            ' '
        )

    );

}


// ==================================================
// NUMÉRO D'UN COUP
// ==================================================

function appendMoveNumber(
    container,
    node,
    forceBlackNumber
) {

    const moveNumber =
        getMoveNumber(
            node
        );


    if (
        node.move.color === 'w'
    ) {

        const number =
            document.createElement(
                'span'
            );


        number.className =
            'move-number';


        number.textContent =
            moveNumber + '. ';


        container.appendChild(
            number
        );

        return;

    }


    if (
        forceBlackNumber
    ) {

        const number =
            document.createElement(
                'span'
            );


        number.className =
            'move-number';


        number.textContent =
            moveNumber + '... ';


        container.appendChild(
            number
        );

    }

}


// ==================================================
// COULEUR DE VARIANTE
// ==================================================

function variationDepthClass(
    depth
) {

    const level =
        ((depth - 1) % 5) + 1;


    return (
        'variation-depth-' +
        level
    );

}


// ==================================================
// REMONTER UNE VARIANTE
// ==================================================

function promoteVariation(
    node
) {

    if (

        !node ||

        !node.parent

    ) {

        return;

    }


    const siblings =
        node.parent.children;


    const index =
        siblings.indexOf(
            node
        );


    if (
        index <= 0
    ) {

        return;

    }


    const previous =
        siblings[index - 1];


    siblings[index - 1] =
        node;


    siblings[index] =
        previous;


    updateMoves();

}


// ==================================================
// CHEVRON DE HIÉRARCHISATION
// ==================================================

function createPromoteButton(
    node
) {

    const button =
        document.createElement(
            'button'
        );


    button.type =
        'button';


    button.className =
        'promote-variation';


    button.title =
        'Remonter cette variante';


    button.setAttribute(

        'aria-label',

        'Remonter cette variante'

    );


    button.addEventListener(

        'click',

        event => {

            event.stopPropagation();


            promoteVariation(
                node
            );

        }

    );


    return button;

}


// ==================================================
// GROUPE DE VARIANTES ALTERNATIVES
// ==================================================

function renderAlternativeGroup(
    mainNode,
    container,
    depth
) {

    if (

        !mainNode ||

        !mainNode.parent

    ) {

        return false;

    }


    const alternatives =
        mainNode.parent.children.filter(

            child =>
                child !== mainNode

        );


    if (
        alternatives.length === 0
    ) {

        return false;

    }


    if (
        depth === 1
    ) {

        container.appendChild(
            document.createElement(
                'br'
            )
        );

    }


    const variation =
        document.createElement(
            'span'
        );


    variation.classList.add(

        'variation',

        variationDepthClass(
            depth
        )

    );


    alternatives.forEach(

        (
            alternative,
            index
        ) => {

            if (
                index > 0
            ) {

                variation.appendChild(

                    document.createTextNode(
                        '; '
                    )

                );

            }


            variation.appendChild(

                document.createTextNode(
                    '( '
                )

            );


            variation.appendChild(

                createPromoteButton(
                    alternative
                )

            );


            renderSequence(

                alternative,

                variation,

                {

                    mainLine:
                        false,

                    variationDepth:
                        depth,

                    suppressAlternativesOnFirst:
                        true

                }

            );


            variation.appendChild(

                document.createTextNode(
                    ')'
                )

            );

        }

    );


    container.appendChild(
        variation
    );


    if (
        depth === 1
    ) {

        container.appendChild(
            document.createElement(
                'br'
            )
        );

    }

    else {

        addSpace(
            container
        );

    }


    return true;

}


// ==================================================
// AFFICHER UNE SÉQUENCE
// ==================================================

function renderSequence(
    startNode,
    container,
    options = {}
) {

    const mainLine =
        options.mainLine === true;


    const variationDepth =
        options.variationDepth || 0;


    const suppressAlternativesOnFirst =
        options.suppressAlternativesOnFirst === true;


    let node =
        startNode;


    let firstNode =
        true;


    let forceBlackNumber =
        false;


    while (
        node
    ) {

        const blackNeedsNumber =

            node.move.color === 'b' &&

            (

                firstNode ||

                forceBlackNumber

            );


        appendMoveNumber(

            container,

            node,

            blackNeedsNumber

        );


        container.appendChild(

            createMoveButton(

                node,

                mainLine

            )

        );


        if (
            node.comment
        ) {

            const comment =
                document.createElement(
                    'span'
                );


            comment.className =
                'game-comment';


            comment.textContent =
                ' (' + node.comment + ')';


            container.appendChild(
                comment
            );

        }


        addSpace(
            container
        );


        let alternativesDisplayed =
            false;


        if (

            !(

                firstNode &&

                suppressAlternativesOnFirst

            )

        ) {

            alternativesDisplayed =
                renderAlternativeGroup(

                    node,

                    container,

                    variationDepth + 1

                );

        }


        const next =
            getMainChild(
                node
            );


        if (
            !next
        ) {

            break;

        }


        forceBlackNumber =

            alternativesDisplayed &&

            next.move.color === 'b';


        node =
            next;


        firstNode =
            false;

    }

}


// ==================================================
// AFFICHAGE GLOBAL DES COUPS
// ==================================================

function updateMoves() {

    const movesElement =
        document.getElementById(
            'moves'
        );


    movesElement.innerHTML =
        '';


    if (

        !rootNode ||

        rootNode.children.length === 0

    ) {

        updateNavigation();

        return;

    }


    const firstMove =
        getMainChild(
            rootNode
        );


    if (
        firstMove
    ) {

        renderSequence(

            firstMove,

            movesElement,

            {

                mainLine:
                    true,

                variationDepth:
                    0,

                suppressAlternativesOnFirst:
                    false

            }

        );

    }


    updateNavigation();

}


// ==================================================
// NAVIGATION
// ==================================================

function updateNavigation() {

    const first =
        document.getElementById(
            'first'
        );


    const previous =
        document.getElementById(
            'previous'
        );


    const next =
        document.getElementById(
            'next'
        );


    const last =
        document.getElementById(
            'last'
        );


    if (
        !currentNode
    ) {

        return;

    }


    first.disabled =
        currentNode === rootNode;


    previous.disabled =
        currentNode === rootNode;


    next.disabled =
        currentNode.children.length === 0;


    last.disabled =
        currentNode.children.length === 0;

}


// ==================================================
// PREMIÈRE POSITION
// ==================================================

document
    .getElementById(
        'first'
    )
    .addEventListener(

        'click',

        () => {

            showNode(
                rootNode
            );

        }

    );


// ==================================================
// COUP PRÉCÉDENT
// ==================================================

document
    .getElementById(
        'previous'
    )
    .addEventListener(

        'click',

        () => {

            if (

                currentNode &&

                currentNode.parent

            ) {

                showNode(
                    currentNode.parent
                );

            }

        }

    );


// ==================================================
// COUP SUIVANT
// ==================================================

document
    .getElementById(
        'next'
    )
    .addEventListener(

        'click',

        () => {

            const child =
                getMainChild(
                    currentNode
                );


            if (
                child
            ) {

                showNode(
                    child
                );

            }

        }

    );


// ==================================================
// DERNIÈRE POSITION
// ==================================================

document
    .getElementById(
        'last'
    )
    .addEventListener(

        'click',

        () => {

            let node =
                currentNode;


            while (

                node &&

                getMainChild(
                    node
                )

            ) {

                node =
                    getMainChild(
                        node
                    );

            }


            if (
                node
            ) {

                showNode(
                    node
                );

            }

        }

    );


// ==================================================
// CHARGER UNE POSITION
// ==================================================

function loadPosition(
    fen
) {

    cancelPromotion();


    stockfish.postMessage(
        'stop'
    );


    thinking =
        false;


    evaluatingPosition =
        false;


    searchId++;


    evaluationSearchId++;


    resetEvaluation();


    const loaded =
        game.load(
            fen
        );


    if (
        !loaded
    ) {

        console.error(
            'FEN invalide :',
            fen
        );

        return;

    }


    currentStartFen =
        game.fen();


    /*
       À chaque chargement, le camp au trait
       est sélectionné automatiquement,
       sauf si le mode analyse est actif.
    */
    if (!isAnalysisMode()) {

        playerSide =
            game.turn() === 'w'
                ? 'white'
                : 'black';

        selectModeButton(
            playerSide
        );

    }


    rootNode = {

        parent:
            null,

        move:
            null,

        source:
            'root',

        children:
            [],

        fen:
            game.fen(),

        selectedChild:
            null,

        comment:
            null

    };


    currentNode =
        rootNode;


    ground.set({

        lastMove:
            getLastMoveSquares(),

        fen:
            game.fen(),

        turnColor:

            game.turn() === 'w'
                ? 'white'
                : 'black',

        movable: {

            color:
                playerColor(),

            dests:

                isPlayerTurn()
                    ? getDests()
                    : new Map()

        }

    });


    updateMoves();

    updateNavigation();

    updateCoordinates();

    updateTurnIndicators();


    /*
       En mode analyse, le joueur
       peut toujours jouer.
    */

    if (
        isAnalysisMode()
    ) {

        enablePlayer();

    }

    else if (
        !isPlayerTurn()
    ) {

        askStockfish();

    }

    else {

        enablePlayer();

    }


    /*
       L'évaluation peut être demandée
       quel que soit le mode.
    */

    if (
        evaluationVisible
    ) {

        requestEvaluation();

    }

}


// ==================================================
// MENU DES FINALES
// ==================================================

function buildLibrarySelect() {

    const select =
        document.getElementById(
            'library-select'
        );


    select.innerHTML =
        '';


    for (
        const key
        of Object.keys(
            libraries
        )
    ) {

        const option =
            document.createElement(
                'option'
            );


        option.value =
            key;


        option.textContent =
            libraries[key].title;


        select.appendChild(
            option
        );

    }


    select.value =
        activeLibraryKey;

    updateLibrarySubtitle();

}


// ==================================================
// MENU DES POSITIONS
// ==================================================

function buildPositionSelect() {

    const select =
        document.getElementById(
            'position-select'
        );


    select.innerHTML =
        '';


    const library =
        libraries[
            activeLibraryKey
        ];


    if (

        !library ||

        !library.positions

    ) {

        return;

    }


    for (
        const position
        of library.positions
    ) {

        const option =
            document.createElement(
                'option'
            );


        option.value =
            position.id;


        option.textContent =
            position.title;


        select.appendChild(
            option
        );

    }


    if (
        library.positions.length > 0
    ) {

        select.value =
            library.positions[0].id;

    }

}


// ==================================================
// POSITION SÉLECTIONNÉE
// ==================================================

function getSelectedPosition() {

    const id =
        document
            .getElementById(
                'position-select'
            )
            .value;


    const library =
        libraries[
            activeLibraryKey
        ];


    if (
        !library
    ) {

        return null;

    }


    return library.positions.find(

        position =>
            position.id === id

    );

}


// ==================================================
// CHANGEMENT DE FINALE
// ==================================================

document
    .getElementById(
        'library-select'
    )
    .addEventListener(

        'change',

        event => {

            activeLibraryKey =
                event.target.value;


            buildPositionSelect();

            updateLibrarySubtitle();


            const position =
                getSelectedPosition();


            if (
                position
            ) {

                loadPosition(
                    position.fen
                );

            }

        }

    );


// ==================================================
// CHANGEMENT DE POSITION
// ==================================================

document
    .getElementById(
        'position-select'
    )
    .addEventListener(

        'change',

        () => {

            const position =
                getSelectedPosition();


            if (
                position
            ) {

                loadPosition(
                    position.fen
                );

            }

        }

    );


// ==================================================
// CHANGEMENT DE MODE
// ==================================================

document
    .querySelectorAll(
        '.mode-button'
    )
    .forEach(

        button => {

            button.addEventListener(

                'click',

                () => {

                    playerSide =
                        button.dataset.mode;

                    selectModeButton(
                        playerSide
                    );


                    /*
                       Mise à jour visuelle
                       des trois boutons.
                    */

                    document
                        .querySelectorAll(
                            '.mode-button'
                        )
                        .forEach(

                            otherButton => {

                                const selected =
                                    otherButton === button;


                                otherButton.classList.toggle(

                                    'selected',

                                    selected

                                );


                                otherButton.setAttribute(

                                    'aria-pressed',

                                    selected
                                        ? 'true'
                                        : 'false'

                                );

                            }

                        );


                    stockfish.postMessage(
                        'stop'
                    );


                    thinking =
                        false;


                    evaluatingPosition =
                        false;


                    if (
                        currentNode
                    ) {

                        showNode(
                            currentNode
                        );

                    }

                }

            );

        }

    );


// ==================================================
// PROFONDEUR STOCKFISH
// ==================================================

const depthSlider =
    document.getElementById(
        'depth'
    );


const depthValue =
    document.getElementById(
        'depth-value'
    );


depthSlider.addEventListener(

    'input',

    () => {

        depthValue.textContent =
            depthSlider.value;

    }

);


// ==================================================
// AFFICHER / MASQUER L'ÉVALUATION
// ==================================================

const evaluationToggle =
    document.getElementById(
        'evaluation-toggle'
    );


const evaluationElement =
    document.getElementById(
        'evaluation'
    );


if (

    evaluationToggle &&

    evaluationElement

) {

    evaluationElement.hidden =
        false;


    renderEvaluation();


    evaluationToggle.addEventListener(

        'click',

        () => {

            evaluationVisible =
                !evaluationVisible;


            evaluationElement.hidden =
                false;


            evaluationToggle.classList.toggle(

                'active',

                evaluationVisible

            );


            evaluationToggle.setAttribute(

                'aria-expanded',

                evaluationVisible
                    ? 'true'
                    : 'false'

            );


            evaluationToggle.title =
                evaluationVisible
                    ? 'Masquer l’évaluation'
                    : 'Afficher l’évaluation';


            if (
                evaluationVisible
            ) {

                latestEvaluation =
                    '—';


                renderEvaluation();


                requestEvaluation();

            }

            else {

                latestEvaluation =
                    '—';


                renderEvaluation();

            }

        }

    );

}



// ==================================================
// EXPORT PGN DE TOUTES LES VARIANTES
// ==================================================

function escapePgnValue(value) {

    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

}


function getPgnMoveNumber(ply) {

    const start =
        getStartMoveInfo();

    const offset =
        start.turn === 'w'
            ? 0
            : 1;

    return (
        start.fullmove +
        Math.floor(
            (ply + offset) / 2
        )
    );

}


function getPgnMoveText(node, ply) {

    const number =
        getPgnMoveNumber(ply);

    if (
        node.move.color === 'w'
    ) {
        return (
            number +
            '. ' +
            node.move.san
        );
    }

    if (ply === 0) {
        return (
            number +
            '... ' +
            node.move.san
        );
    }

    return node.move.san;

}


function exportPgnLine(node, ply) {

    if (!node) {
        return '';
    }

    let text =
        getPgnMoveText(
            node,
            ply
        );

    const mainChild =
        getMainChild(node);

    const alternatives =
        node.children.filter(
            child =>
                child !== mainChild
        );

    alternatives.forEach(
        alternative => {

            const variation =
                exportPgnLine(
                    alternative,
                    ply + 1
                );

            if (variation) {
                text +=
                    ' (' +
                    variation +
                    ')';
            }

        }
    );

    if (mainChild) {

        const continuation =
            exportPgnLine(
                mainChild,
                ply + 1
            );

        if (continuation) {
            text +=
                ' ' +
                continuation;
        }

    }

    return text;

}


function buildCompletePgn() {

    const library =
        libraries[activeLibraryKey];

    const position =
        getSelectedPosition();

    const title =
        position
            ? position.title
            : (
                library
                    ? library.title
                    : 'Entraînement aux finales'
            );

    let pgn =
        '[Event "' +
        escapePgnValue(title) +
        '"]\n';

    pgn +=
        '[Site "TdB - Entraînement aux Finales"]\n';

    pgn +=
        '[FEN "' +
        escapePgnValue(currentStartFen) +
        '"]\n';

    pgn +=
        '[SetUp "1"]\n';

    pgn +=
        '[Result "*"]\n\n';

    if (
        rootNode &&
        rootNode.children.length > 0
    ) {

        pgn +=
            exportPgnLine(
                getMainChild(rootNode),
                0
            );

    }

    pgn +=
        (
            pgn.endsWith('\n\n')
                ? ''
                : ' '
        ) +
        '*\n';

    return pgn;

}


function downloadCompletePgn() {

    const blob =
        new Blob(
            [buildCompletePgn()],
            {
                type:
                    'application/x-chess-pgn;charset=utf-8'
            }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement('a');

    const position =
        getSelectedPosition();

    const name =
        (
            position
                ? position.title
                : 'finale-echecs'
        )
            .toLowerCase()
            .normalize('NFD')
            .replace(
                /[\u0300-\u036f]/g,
                ''
            )
            .replace(
                /[^a-z0-9]+/g,
                '-'
            )
            .replace(
                /^-|-$/g,
                ''
            );

    link.href = url;
    link.download = name + '.pgn';

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

}


function setupPgnExportButton() {

    const control =
        document.querySelector(
            '.notation-control'
        );

    if (
        !control ||
        document.getElementById(
            'export-pgn'
        )
    ) {
        return;
    }

    const button =
        document.createElement('button');

    button.id = 'export-pgn';
    button.type = 'button';
    button.className = 'export-pgn-button';

    button.title =
        'Télécharger toutes les variantes en PGN';

    button.setAttribute(
        'aria-label',
        'Télécharger toutes les variantes en PGN'
    );

    const icon =
        document.createElement('img');

    icon.src =
        './images/download-pgn.png';

    icon.alt = '';
    icon.setAttribute(
        'aria-hidden',
        'true'
    );

    icon.className =
        'export-pgn-icon';

    button.appendChild(icon);

    const label =
        document.createElement('span');

    label.textContent =
        'PGN';

    button.appendChild(label);

    button.addEventListener(
        'click',
        downloadCompletePgn
    );

    control.appendChild(button);

}


// ==================================================
// MENU PERSONNALISÉ DE NOTATION AVEC FIGURINES SVG
// ==================================================

function setupNotationMenu() {

    const select =
        document.getElementById('notation');

    if (!select || document.getElementById('notation-menu')) {
        return;
    }

    select.classList.add('notation-native-select');

    const menu =
        document.createElement('div');

    menu.id = 'notation-menu';
    menu.className = 'notation-menu';

    const button =
        document.createElement('button');

    button.type = 'button';
    button.className = 'notation-menu-button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.title = 'Choisir la notation';

    const preview =
        document.createElement('span');

    preview.className = 'notation-menu-preview';

    const arrow =
        document.createElement('span');

    arrow.className = 'notation-menu-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '▾';

    button.appendChild(preview);
    button.appendChild(arrow);

    const list =
        document.createElement('div');

    list.className = 'notation-menu-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;

    const choices = [
        {
            value: 'french',
            text: 'R D T F C'
        },
        {
            value: 'figurines',
            pieces: ['wK.svg', 'wQ.svg', 'wR.svg', 'wB.svg', 'wN.svg']
        },
        {
            value: 'international',
            text: 'K Q R B N'
        }
    ];

    function fillContent(container, choice) {

        container.innerHTML = '';

        if (choice.pieces) {

            choice.pieces.forEach(piece => {

                const image =
                    document.createElement('img');

                image.src =
                    './pieces/alpha/' + piece;

                image.alt = '';
                image.setAttribute('aria-hidden', 'true');
                image.className = 'notation-menu-piece';

                container.appendChild(image);

            });

            return;
        }

        container.textContent = choice.text;
    }

    choices.forEach(choice => {

        const item =
            document.createElement('button');

        item.type = 'button';
        item.className = 'notation-menu-option';
        item.dataset.value = choice.value;
        item.setAttribute('role', 'option');

        fillContent(item, choice);

        item.addEventListener('click', () => {

            select.value = choice.value;

            select.dispatchEvent(
                new Event(
                    'change',
                    { bubbles: true }
                )
            );

            updateMenu();
            closeMenu();

        });

        list.appendChild(item);

    });

    function getChoice(value) {

        return choices.find(
            choice => choice.value === value
        ) || choices[0];
    }

    function updateMenu() {

        const choice =
            getChoice(select.value);

        fillContent(preview, choice);

        list
            .querySelectorAll('.notation-menu-option')
            .forEach(item => {

                const selected =
                    item.dataset.value === select.value;

                item.classList.toggle(
                    'selected',
                    selected
                );

                item.setAttribute(
                    'aria-selected',
                    selected ? 'true' : 'false'
                );

            });
    }

    function closeMenu() {

        list.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        menu.classList.remove('open');
    }

    button.addEventListener('click', event => {

        event.stopPropagation();

        const willOpen = list.hidden;

        if (willOpen) {

            list.hidden = false;
            button.setAttribute('aria-expanded', 'true');
            menu.classList.add('open');

        } else {

            closeMenu();
        }

    });

    select.addEventListener(
        'change',
        updateMenu
    );

    document.addEventListener('click', event => {

        if (!menu.contains(event.target)) {
            closeMenu();
        }

    });

    document.addEventListener('keydown', event => {

        if (event.key === 'Escape') {
            closeMenu();
        }

    });

    menu.appendChild(button);
    menu.appendChild(list);

    select.insertAdjacentElement(
        'afterend',
        menu
    );

    updateMenu();
}


// ==================================================
// NOTATION
// ==================================================

document
    .getElementById(
        'notation'
    )
    .addEventListener(

        'change',

        updateMoves

    );


// ==================================================
// RECOMMENCER
// ==================================================

document
    .getElementById(
        'restart'
    )
    .addEventListener(

        'click',

        () => {

            loadPosition(
                currentStartFen
            );

        }

    );


// ==================================================
// RETOURNER L'ÉCHIQUIER
// ==================================================

document
    .getElementById(
        'flip'
    )
    .addEventListener(

        'click',

        () => {

            ground.set({

        lastMove:
            getLastMoveSquares(),

                orientation:

                    ground.state.orientation ===
                    'white'

                        ? 'black'

                        : 'white'

            });


            updateCoordinates();

            requestAnimationFrame(
                updateTurnIndicators
            );

        }

    );


// ==================================================
// ANNULER LA PROMOTION
// ==================================================

const promotionCancel =
    document.getElementById(
        'promotion-cancel'
    );


if (
    promotionCancel
) {

    promotionCancel.addEventListener(

        'click',

        () => {

            cancelPromotion();


            ground.set({

        lastMove:
            getLastMoveSquares(),

                fen:
                    game.fen()

            });


            if (
                isPlayerTurn()
            ) {

                enablePlayer();

            }

        }

    );

}


// ==================================================
// REDIMENSIONNEMENT
// ==================================================

window.addEventListener(

    'resize',

    () => {

        requestAnimationFrame(
            updateTurnIndicators
        );

    }

);


// ==================================================
// DÉMARRAGE
// ==================================================

setupModeButtonImages();

setupStockfishImage();

// setupLibraryPresentation();

setupNotationMenu();

setupPgnExportButton();

buildLibrarySelect();

buildPositionSelect();

updateLibrarySubtitle();

updateCoordinates();

resetEvaluation();


const firstPosition =
    getSelectedPosition();


if (
    firstPosition
) {

    loadPosition(
        firstPosition.fen
    );

}


requestAnimationFrame(
    updateTurnIndicators
);