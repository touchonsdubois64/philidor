// ==================================================
// BIBLIOTHÈQUE DES POSITIONS
// ==================================================
//
// Pour ajouter une position, copiez simplement un bloc
// et modifiez :
//    title = nom affiché dans le menu
//    fen   = position FEN
//
// Vous pouvez ensuite créer autant de positions
// que vous le souhaitez.
//
// ==================================================


export const libraries = {

    


    // ==================================================
    // POSITIONS DE PHILIDOR
    // ==================================================

    philidor: {

        title: 'Positions de Philidor',

        positions: [

            {
                id: 'philidor-01',

                title:
                    'Tour et Pion vs Tour - Les Blancs jouent et font nulle',

                fen:
                    '6k1/1p6/1P1p4/3p4/3Pp2p/4P2p/1K5P/8 w - - 0 1'
            },

            {
                id: 'philidor-02',

                title:
                    'Dame vs Tour - Les Blancs jouent et gagnent',

                fen:
                    '1k6/1r6/2K5/Q7/8/8/8/8 w - - 0 1'
            },

             {
                id: 'philidor-03',

                title:
                    'Tour et Fou vs Tour - Les Blancs jouent et gagnent',

                fen:
                    '3k4/4r3/3K4/3B4/8/8/8/5R2 w - - 0 1'
            },
          

            {
                id: 'philidor-04',

                title:
                    'Tour et Fou vs Tour - Les Noirs jouent et font nulle',

                fen:
                    '3k4/4r3/3K4/3B4/8/8/8/5R2 b - - 0 1'
            },
          
        ]

    }

};

