/* ==============================================
This file is originally written by Stanley Lam
===============================================*/

var http = require('http');
var express = require('express');
var socketio = require('socket.io');

var app = express();
var server = http.createServer(app);
var io = socketio(server);

app.use(express.static(__dirname + '/client'));
server.listen(5000);
console.log("Server started.");

// ========== CONSTANTS ==========

const TOTAL_PLAYERS = 2;
const COUNT_DOWN_SECONDS = 3;
const PLAYER_1 = 0, PLAYER_2 = 1;
const EMPTY = 0, RED = 1, GREEN = 2, ORANGE = 3, YELLOW = 4, CYAN = 5, PURPLE = 6, BLUE = 7;
const SHARP_I = 0, SHARP_J = 1, SHARP_L = 2, SHARP_O = 3, SHARP_S = 4, SHARP_T = 5, SHARP_Z = 6;
const ZERO_DEGREE = 0, NINETY_DEGREE = 90, ONE_EIGHTY_DEGREE = 180, TWO_SEVENTY_DEGREE = 270;
const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3, MUTE = 4;
const GAMEBOARD_LENGTH = 10, GAMEBOARD_WIDTH = 20;
const PLAYER1_GAMEBOARD_START_X = 140, PLAYER1_GAMEBOARD_START_Y = 80;
const PLAYER2_GAMEBOARD_START_X = 420, PLAYER2_GAMEBOARD_START_Y = 80;
const SHAPE_INITIAL_X_INDEX = 3, SHAPE_INITIAL_Y_INDEX = 0;
const FPS = 60;
const NUMBER_OF_SHAPE_GENERATED = 50000;

const NUMBER_OF_SQUARES_IN_SHAPE = 4;
const SQUARE_DIMEMSION = 20;

const GAME_STATE_NO_PLAYER = 0,
      GAME_STATE_WAITING_OTHER_PLAYER = 1,
      GAME_STATE_CHOOSE_LEVEL = 2,
      GAME_STATE_LEVEL_MISMATCH = 3,
      GAME_STATE_STARTING_COUNT = 4,
      GAME_STATE_PLAYING = 5,
      GAME_STATE_GAMEOVER = 6,
      GAME_STATE_PLAYER_DISCONNECTED = 7;

const LEVEL_GAME_UPDATE_TIME = [999999,
        60, 55, 50, 45, 40,
        35, 30, 25, 20, 15,
        14, 13, 12, 11, 10,
        9,  8,  7,  6,  5];

const NEXT_LEVEL_REQUIRED_LINES = [0, 20, 20, 20, 20, 20,
        25, 25, 25, 25, 25,
        30, 30, 30, 30, 30,
        12, 12, 12, 12];

function SHAPE()
{
    this.x_index = new Array(NUMBER_OF_SQUARES_IN_SHAPE),
    this.y_index = new Array(NUMBER_OF_SQUARES_IN_SHAPE),
    this.color = null,
    this.rotate_degree = ZERO_DEGREE,
    this.type_of_shape = null;
};

function PLAYER_DATA()
{
    this.socket_id             = null,
    this.shape_count              = -1,
    this.next_level_line_count = 0,
    this.update_game_time      = 0,
    // the following data will sending to client
    this.client_package = {
        name           : "",
        ip_address     : "",
        player_id      : -1,
        selected_level : 1,
        level          : 0,
        lines          : 0,
        tetris         : 0,
        confirm        : false,
        gameover       : false,
        current_shape  : null,
        next_shape     : null,
        gameboard_data : null
    }
};

function init_gameboard()
{
    var board = new Array(GAMEBOARD_WIDTH);
    for(var i=0; i<GAMEBOARD_WIDTH; i++){
        board[i] = [];
        for(var j=0; j<GAMEBOARD_LENGTH; j++)
            board[i].push(EMPTY);
    }
    return board;
};

function getRandomIntInclusive(min, max)
{
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min; //The maximum is inclusive and the minimum is inclusive
};


// ====== END OF CONSTANTS =======

var current_game_state = GAME_STATE_NO_PLAYER;

var update_frame_time = 0;
var update_count_down_time_frame = 60;

var current_count_second = -1;

var all_players_selected_level = -1;

var players_obj = {};

var index_array = [];
for(var i=0; i<TOTAL_PLAYERS; i++) index_array.push(i);

var shape_array = new Array(NUMBER_OF_SHAPE_GENERATED);

function generateFiftyThousandShapesNumber()
{
    for(var i=0; i < NUMBER_OF_SHAPE_GENERATED; i++)
        shape_array[i] = { color: getRandomIntInclusive(1,7), shape: getRandomIntInclusive(0,6) };
};

io.on('connection', function(socket){

    var get_ip_address =
             socket.request.headers['x-forwarded-for'] ||
             socket.request.connection.remoteAddress ||
             socket.request.socket.remoteAddress ||
             socket.request.connection.socket.remoteAddress;
    var ip_address = get_ip_address.replace(/^.*:/, '');

    socket.on('login request', function(name, passcode){
        if( passcode == "L" )
        {
            var players_size = Object.keys(players_obj).length;

            if(players_size < TOTAL_PLAYERS)
            {
                players_obj[socket.id] = new PLAYER_DATA();
                players_obj[socket.id].socket_id = socket.id;
                players_obj[socket.id].shape_count = 0;
                players_obj[socket.id].next_level_line_count = 0;
                players_obj[socket.id].client_package.player_id = index_array.shift(); // get the first index in index array and remove it from the array
                players_obj[socket.id].client_package.name = name;
                players_obj[socket.id].client_package.ip_address = ip_address;
                players_obj[socket.id].client_package.selected_level = 1;
                players_obj[socket.id].client_package.level = 0;
                players_obj[socket.id].client_package.lines = 0;
                players_obj[socket.id].client_package.tetris = 0;
                players_obj[socket.id].client_package.confirm = false;
                players_obj[socket.id].client_package.gameover = false;
                players_obj[socket.id].client_package.gameboard_data = init_gameboard();

                players_size++;

                if(current_game_state == GAME_STATE_NO_PLAYER) // first player connects to the server
                {
                    current_game_state = GAME_STATE_WAITING_OTHER_PLAYER;
                }
                else if(current_game_state == GAME_STATE_WAITING_OTHER_PLAYER || current_game_state == GAME_STATE_PLAYER_DISCONNECTED)
                {
                    current_game_state = GAME_STATE_CHOOSE_LEVEL;
                }

                var player_id = players_obj[socket.id].client_package.player_id;
                io.to(socket.id).emit('assign player id', player_id);

                // print out the new user information in the console of the server
                console.log("new user: " + name + " - " + ip_address + " logged.");
            }
            else io.to(socket.id).emit('not avaiable found');
        }
        else io.to(socket.id).emit('wrong passcode');
    });

    socket.on('disconnect',function(){

        if(socket.id in players_obj){

            console.log(players_obj[socket.id].client_package.name +" - " + players_obj[socket.id].client_package.ip_address + " left.");

            index_array.push(players_obj[socket.id].client_package.player_id); // recycle back the player id

            delete players_obj[socket.id];

            // reset game state based on the current state
            switch(current_game_state)
            {
                case GAME_STATE_NO_PLAYER:
                {
                    break;
                }
                case GAME_STATE_WAITING_OTHER_PLAYER:
                {
                    current_game_state = GAME_STATE_NO_PLAYER;
                    break;
                }
                case GAME_STATE_CHOOSE_LEVEL:
                {
                    current_game_state = GAME_STATE_PLAYER_DISCONNECTED;
                    for(sock in players_obj)
                        players_obj[sock].client_package.confirm = false;
                    break;
                }
                case GAME_STATE_STARTING_COUNT:
                {
                    current_game_state = GAME_STATE_PLAYER_DISCONNECTED;
                    for(sock in players_obj)
                        players_obj[sock].client_package.confirm = false;
                    break;
                }
                case GAME_STATE_PLAYING:
                {
                    current_game_state = GAME_STATE_PLAYER_DISCONNECTED;
                    for(sock in players_obj)
                        players_obj[sock].client_package.confirm = false;
                    break;
                }
                case GAME_STATE_GAMEOVER:
                {
                    current_game_state = GAME_STATE_PLAYER_DISCONNECTED;
                    for(sock in players_obj)
                        players_obj[sock].client_package.confirm = false;
                    break;
                }
                case GAME_STATE_PLAYER_DISCONNECTED:
                {
                    var players_size = Object.keys(players_obj).length;
                    if(players_size == 0)
                        current_game_state = GAME_STATE_NO_PLAYER;
                    break;
                }
            }
        }
    });

    socket.on('select level',function(player_selected_level){
        if(!players_obj[socket.id].client_package.confirm)
        {
            players_obj[socket.id].client_package.selected_level = player_selected_level;

            for(sock in players_obj)
                if(players_obj[sock].client_package.selected_level != player_selected_level)
                    players_obj[sock].client_package.confirm = false;
        }
    });

    socket.on('confirm level',function(){
        if(!players_obj[socket.id].client_package.confirm)
        {
            players_obj[socket.id].client_package.confirm = true;

            var all_players_agreed_selected_level = players_obj[socket.id].client_package.selected_level;

            for(sock in players_obj)
                if(players_obj[sock].client_package.selected_level != all_players_agreed_selected_level)
                    players_obj[sock].client_package.confirm = false;

            var all_players_confirm = true;
            for(sock in players_obj)
                if(!players_obj[sock].client_package.confirm)
                    all_players_confirm = false;

            if(all_players_confirm)
            {
                for(sock in players_obj)
                {
                    players_obj[sock].client_package.level = all_players_agreed_selected_level;
                    // reset players' data
                    players_obj[sock].shape_count = 0;
                    players_obj[sock].next_level_line_count = 0;
                    players_obj[sock].client_package.lines = 0;
                    players_obj[sock].client_package.tetris = 0;
                    players_obj[sock].client_package.gameover = false;
                    for(var i=0; i<GAMEBOARD_WIDTH; i++)
                        for(var j=0; j<GAMEBOARD_LENGTH; j++)
                            players_obj[sock].client_package.gameboard_data[i][j] = EMPTY;
                }
                generateFiftyThousandShapesNumber(); // generate new shapes
                current_game_state = GAME_STATE_STARTING_COUNT;
                current_count_second = COUNT_DOWN_SECONDS;
            }
        }
    });

    socket.on('key handler',function(keyIndex){
        if(current_game_state == GAME_STATE_PLAYING)
        {
            if(!players_obj[socket.id].client_package.gameover)
            {
                var gameboard = players_obj[socket.id].client_package.gameboard_data;
                var current_shape = players_obj[socket.id].client_package.current_shape;

                if(keyIndex == UP)
                {
                    switch(current_shape.type_of_shape)
                    {
                        case SHARP_I:
                        {
                            var x = current_shape.x_index[1], y = current_shape.y_index[1];  // the pivot index of all shapes is 1

                            /*****************
                             *   *   *   *   *
                             * 0 * 1 * 2 * 3 *
                             *   *   *   *   *
                             *****************/
                            if(current_shape.rotate_degree == ZERO_DEGREE)
                            {
                                if( (y-1) >= 0 && (y+2) < GAMEBOARD_WIDTH )
                                {
                                    if(gameboard[y-1][x] == EMPTY && gameboard[y+1][x] == EMPTY && gameboard[y+2][x] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] + 1; current_shape.y_index[0] = current_shape.y_index[0] - 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] - 1; current_shape.y_index[2] = current_shape.y_index[2] + 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] - 2; current_shape.y_index[3] = current_shape.y_index[3] + 2;
                                        current_shape.rotate_degree = NINETY_DEGREE;
                                    }
                                }
                            }
                            /*****
                             *   *
                             * 0 *
                             *   *
                             *****
                             *   *
                             * 1 *
                             *   *
                             *****
                             *   *
                             * 2 *
                             *   *
                             *****
                             *   *
                             * 3 *
                             *   *
                             *****/
                            else if(current_shape.rotate_degree == NINETY_DEGREE)
                            {
                                if( (x-1) >= 0 && (x+2) < GAMEBOARD_LENGTH )
                                if(gameboard[y][x-1] == EMPTY && gameboard[y][x+1] == EMPTY && gameboard[y][x+2] == EMPTY)
                                {
                                    current_shape.x_index[0] = current_shape.x_index[0] - 1; current_shape.y_index[0] = current_shape.y_index[0] + 1;
                                    current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                    current_shape.x_index[2] = current_shape.x_index[2] + 1; current_shape.y_index[2] = current_shape.y_index[2] - 1;
                                    current_shape.x_index[3] = current_shape.x_index[3] + 2; current_shape.y_index[3] = current_shape.y_index[3] - 2;
                                    current_shape.rotate_degree = ZERO_DEGREE;
                                }
                            }
                            /*****************
                             *   *   *   *   *
                             * 0 * 1 * 2 * 3 *
                             *   *   *   *   *
                             *****************/
                            else console.log("ERROR in I shape: No such rotating degree!");

                            break;
                        }
                        case SHARP_J:
                        {
                            var x = current_shape.x_index[1], y = current_shape.y_index[1];

                            /*****
                             *   *
                             * 3 *
                             *   *
                             *************
                             *   *   *   *
                             * 0 * 1 * 2 *
                             *   *   *   *
                             *************/
                            if(current_shape.rotate_degree == ZERO_DEGREE)
                            {
                                if( (y-1) >= 0 && (y+1) < GAMEBOARD_WIDTH && (x+1) < GAMEBOARD_LENGTH )
                                {
                                    if(gameboard[y-1][x] == EMPTY && gameboard[y-1][x+1] == EMPTY && gameboard[y+1][x] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] + 1; current_shape.y_index[0] = current_shape.y_index[0] - 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] - 1; current_shape.y_index[2] = current_shape.y_index[2] + 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] + 2; current_shape.y_index[3] = current_shape.y_index[3] + 0;
                                        current_shape.rotate_degree = NINETY_DEGREE;
                                    }
                                }
                            }
                            /*********
                             *   *   *
                             * 0 * 3 *
                             *   *   *
                             *********
                             *   *
                             * 1 *
                             *   *
                             *****
                             *   *
                             * 2 *
                             *   *
                             *****/
                            else if(current_shape.rotate_degree == NINETY_DEGREE)
                            {
                                if( (x-1) >= 0 && (x+1) < GAMEBOARD_LENGTH && (y+1) < GAMEBOARD_WIDTH )
                                if(gameboard[y][x-1] == EMPTY && gameboard[y][x+1] == EMPTY && gameboard[y+1][x+1] == EMPTY)
                                {
                                    current_shape.x_index[0] = current_shape.x_index[0] + 1; current_shape.y_index[0] = current_shape.y_index[0] + 1;
                                    current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                    current_shape.x_index[2] = current_shape.x_index[2] - 1; current_shape.y_index[2] = current_shape.y_index[2] - 1;
                                    current_shape.x_index[3] = current_shape.x_index[3] + 0; current_shape.y_index[3] = current_shape.y_index[3] + 2;
                                    current_shape.rotate_degree = ONE_EIGHTY_DEGREE;
                                }
                            }
                            /*************
                             *   *   *   *
                             * 2 * 1 * 0 *
                             *   *   *   *
                             *************
                                     *   *
                                     * 3 *
                                     *   *
                                     *****/
                            else if(current_shape.rotate_degree == ONE_EIGHTY_DEGREE)
                            {
                                if( (y-1) >= 0 && (y+1) < GAMEBOARD_WIDTH && (x-1) >= 0 )
                                {
                                    if(gameboard[y-1][x] == EMPTY && gameboard[y+1][x] == EMPTY && gameboard[y+1][x-1] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] - 1; current_shape.y_index[0] = current_shape.y_index[0] + 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] + 1; current_shape.y_index[2] = current_shape.y_index[2] - 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] - 2; current_shape.y_index[3] = current_shape.y_index[3] + 0;
                                        current_shape.rotate_degree = TWO_SEVENTY_DEGREE;
                                    }
                                }
                            }
                            /*   *****
                                 *   *
                                 * 2 *
                                 *   *
                                 *****
                                 *   *
                                 * 1 *
                                 *   *
                             *********
                             *   *   *
                             * 3 * 0 *
                             *   *   *
                             *********/
                            else if(current_shape.rotate_degree == TWO_SEVENTY_DEGREE)
                            {
                                if( (y-1) >= 0 && (y+1) < GAMEBOARD_WIDTH && (x-1) >= 0 && (x+1) < GAMEBOARD_LENGTH )
                                {
                                    if(gameboard[y][x-1] == EMPTY && gameboard[y-1][x-1] == EMPTY && gameboard[y+1][x+1] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] - 1; current_shape.y_index[0] = current_shape.y_index[0] - 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] + 1; current_shape.y_index[2] = current_shape.y_index[2] + 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] + 0; current_shape.y_index[3] = current_shape.y_index[3] - 2;
                                        current_shape.rotate_degree = ZERO_DEGREE;
                                    }
                                }
                            }
                            /*****
                             *   *
                             * 3 *
                             *   *
                             *************
                             *   *   *   *
                             * 0 * 1 * 2 *
                             *   *   *   *
                             *************/
                            else console.log("ERROR in J shape: No such rotating degree!");
                            break;
                        }
                        case SHARP_L:
                        {
                            var x = current_shape.x_index[1], y = current_shape.y_index[1];

                            /*       *****
                                     *   *
                                     * 3 *
                                     *   *
                             *************
                             *   *   *   *
                             * 0 * 1 * 2 *
                             *   *   *   *
                             *************/
                            if(current_shape.rotate_degree == ZERO_DEGREE)
                            {
                                if( (y-1) >= 0 && (y+1) < GAMEBOARD_WIDTH && (x+1) < GAMEBOARD_LENGTH )
                                {
                                    if(gameboard[y-1][x] == EMPTY && gameboard[y+1][x] == EMPTY && gameboard[y+1][x+1] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] + 1; current_shape.y_index[0] = current_shape.y_index[0] - 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] - 1; current_shape.y_index[2] = current_shape.y_index[2] + 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] + 0; current_shape.y_index[3] = current_shape.y_index[3] + 2;
                                        current_shape.rotate_degree = NINETY_DEGREE;
                                    }
                                }
                            }
                            /*****
                             *   *
                             * 0 *
                             *   *
                             *****
                             *   *
                             * 1 *
                             *   *
                             *********
                             *   *   *
                             * 2 * 3 *
                             *   *   *
                             *********/
                            else if(current_shape.rotate_degree == NINETY_DEGREE)
                            {
                                if( (y+1) < GAMEBOARD_WIDTH && (x-1) >= 0 && (x+1) < GAMEBOARD_LENGTH )
                                {
                                    if(gameboard[y][x-1] == EMPTY && gameboard[y+1][x-1] == EMPTY && gameboard[y][x+1] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] + 1; current_shape.y_index[0] = current_shape.y_index[0] + 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] - 1; current_shape.y_index[2] = current_shape.y_index[2] - 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] - 2; current_shape.y_index[3] = current_shape.y_index[3] + 0;
                                        current_shape.rotate_degree = ONE_EIGHTY_DEGREE;
                                    }
                                }
                            }
                            /*************
                             *   *   *   *
                             * 2 * 1 * 0 *
                             *   *   *   *
                             *************
                             *   *
                             * 3 *
                             *   *
                             *****/
                            else if(current_shape.rotate_degree == ONE_EIGHTY_DEGREE)
                            {
                                if( (y-1) >= 0 && (y+1) < GAMEBOARD_WIDTH && (x-1) >= 0 )
                                {
                                    if(gameboard[y-1][x] == EMPTY && gameboard[y-1][x-1] == EMPTY && gameboard[y+1][x] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] - 1; current_shape.y_index[0] = current_shape.y_index[0] + 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] + 1; current_shape.y_index[2] = current_shape.y_index[2] - 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] + 0; current_shape.y_index[3] = current_shape.y_index[3] - 2;
                                        current_shape.rotate_degree = TWO_SEVENTY_DEGREE;
                                    }
                                }
                            }
                            /*********
                             *   *   *
                             * 3 * 2 *
                             *   *   *
                             *********
                                 *   *
                                 * 1 *
                                 *   *
                                 *****
                                 *   *
                                 * 0 *
                                 *   *
                                 *****/
                            else if(current_shape.rotate_degree == TWO_SEVENTY_DEGREE)
                            {
                                if( (y-1) >= 0 && (x-1) >= 0 && (x+1) < GAMEBOARD_LENGTH )
                                {
                                    if(gameboard[y][x-1] == EMPTY && gameboard[y][x+1] == EMPTY && gameboard[y-1][x+1] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] - 1; current_shape.y_index[0] = current_shape.y_index[0] - 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] + 1; current_shape.y_index[2] = current_shape.y_index[2] + 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] + 2; current_shape.y_index[3] = current_shape.y_index[3] + 0;
                                        current_shape.rotate_degree = ZERO_DEGREE;
                                    }
                                }
                            }
                            /*       *****
                                     *   *
                                     * 3 *
                                     *   *
                             *************
                             *   *   *   *
                             * 0 * 1 * 2 *
                             *   *   *   *
                             *************/
                            else console.log("ERROR in L shape: No such rotating degree!");
                            break;
                        }
                        case SHARP_O:
                        {
                            // nothing needs to change since it is a square
                            /*********
                             *   *   *
                             * 0 * 1 *
                             *   *   *
                             *********
                             *   *   *
                             * 2 * 3 *
                             *   *   *
                             *********/
                            break;
                        }
                        case SHARP_S:
                        {
                            var x = current_shape.x_index[1], y = current_shape.y_index[1];
                            /*   *********
                                 *   *   *
                                 * 2 * 3 *
                                 *   *   *
                             *************
                             *   *   *
                             * 0 * 1 *
                             *   *   *
                             *********   */
                            if(current_shape.rotate_degree == ZERO_DEGREE)
                            {
                                if( (y+1) < GAMEBOARD_WIDTH && (x+1) < GAMEBOARD_LENGTH )
                                {
                                    if(gameboard[y][x+1] == EMPTY && gameboard[y+1][x+1] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] + 1; current_shape.y_index[0] = current_shape.y_index[0] - 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] + 1; current_shape.y_index[2] = current_shape.y_index[2] + 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] + 0; current_shape.y_index[3] = current_shape.y_index[3] + 2;
                                        current_shape.rotate_degree = NINETY_DEGREE;
                                    }
                                }
                            }
                            /*****
                             *   *
                             * 0 *
                             *   *
                             *********
                             *   *   *
                             * 1 * 2 *
                             *   *   *
                             *********
                                   *   *
                                 * 3 *
                                 *   *
                                 *****/
                            else if(current_shape.rotate_degree == NINETY_DEGREE)
                            {
                                if( (y-1) >= 0 && (x-1) >= 0 && (x+1) < GAMEBOARD_LENGTH )
                                {
                                    if(gameboard[y][x-1] == EMPTY && gameboard[y-1][x+1] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] - 1; current_shape.y_index[0] = current_shape.y_index[0] + 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] - 1; current_shape.y_index[2] = current_shape.y_index[2] - 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] + 0; current_shape.y_index[3] = current_shape.y_index[3] - 2;
                                        current_shape.rotate_degree = ZERO_DEGREE;
                                    }
                                }
                            }
                            /*   *********
                                 *   *   *
                                 * 2 * 3 *
                                 *   *   *
                             *************
                             *   *   *
                             * 0 * 1 *
                             *   *   *
                             *********   */
                            else console.log("ERROR in S shape: No such rotating degree!");
                            break;
                        }
                        case SHARP_T:
                        {
                            var x = current_shape.x_index[1], y = current_shape.y_index[1];
                            /*   *****
                                 *   *
                                 * 3 *
                                 *   *
                             *************
                             *   *   *   *
                             * 0 * 1 * 2 *
                             *   *   *   *
                             *************/
                            if(current_shape.rotate_degree == ZERO_DEGREE)
                            {
                                if( (y+1) < GAMEBOARD_WIDTH )
                                {
                                    if(gameboard[y+1][x] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] + 1; current_shape.y_index[0] = current_shape.y_index[0] - 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] - 1; current_shape.y_index[2] = current_shape.y_index[2] + 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] + 1; current_shape.y_index[3] = current_shape.y_index[3] + 1;
                                        current_shape.rotate_degree = NINETY_DEGREE;
                                    }
                                }
                            }
                            /*****
                             *   *
                             * 0 *
                             *   *
                             *********
                             *   *   *
                             * 1 * 3 *
                             *   *   *
                             *********
                             *   *
                             * 2 *
                             *   *
                             *****/
                            else if(current_shape.rotate_degree == NINETY_DEGREE)
                            {
                                if( (x-1) >= 0 )
                                {
                                    if(gameboard[y][x-1] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] + 1; current_shape.y_index[0] = current_shape.y_index[0] + 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] - 1; current_shape.y_index[2] = current_shape.y_index[2] - 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] - 1; current_shape.y_index[3] = current_shape.y_index[3] + 1;
                                        current_shape.rotate_degree = ONE_EIGHTY_DEGREE;
                                    }
                                }
                            }
                            /*************
                             *   *   *   *
                             * 2 * 1 * 0 *
                             *   *   *   *
                             *************
                                 *   *
                                 * 3 *
                                 *   *
                                 *****/
                            else if(current_shape.rotate_degree == ONE_EIGHTY_DEGREE)
                            {
                                if( (y-1) >= 0 )
                                {
                                    if(gameboard[y-1][x] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] - 1; current_shape.y_index[0] = current_shape.y_index[0] + 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] + 1; current_shape.y_index[2] = current_shape.y_index[2] - 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] - 1; current_shape.y_index[3] = current_shape.y_index[3] - 1;
                                        current_shape.rotate_degree = TWO_SEVENTY_DEGREE;
                                    }
                                }
                            }
                            /*   *****
                                 *   *
                                 * 2 *
                                 *   *
                             *********
                             *   *   *
                             * 3 * 1 *
                             *   *   *
                             *********
                                 *   *
                                 * 0 *
                                 *   *
                                 *****/
                            else if(current_shape.rotate_degree == TWO_SEVENTY_DEGREE)
                            {
                                if( (x+1) < GAMEBOARD_LENGTH )
                                {
                                    if(gameboard[y][x+1] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] - 1; current_shape.y_index[0] = current_shape.y_index[0] - 1;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] + 1; current_shape.y_index[2] = current_shape.y_index[2] + 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] + 1; current_shape.y_index[3] = current_shape.y_index[3] - 1;
                                        current_shape.rotate_degree = ZERO_DEGREE;
                                    }
                                }
                            }
                            /*   *****
                                 *   *
                                 * 3 *
                                 *   *
                             *************
                             *   *   *   *
                             * 0 * 1 * 2 *
                             *   *   *   *
                             *************/
                            else console.log("ERROR in T shape: No such rotating degree!");
                            break;
                        }
                        case SHARP_Z:
                        {
                            var x = current_shape.x_index[1], y = current_shape.y_index[1];
                            /*********
                             *   *   *
                             * 0 * 2 *
                             *   *   *
                             *************
                                 *   *   *
                                 * 1 * 3 *
                                 *   *   *
                                 *********/
                            if(current_shape.rotate_degree == ZERO_DEGREE)
                            {
                                if( (y-1) >= 0 && (y+1) < GAMEBOARD_WIDTH && (x+1) < GAMEBOARD_LENGTH )
                                if(gameboard[y+1][x] == EMPTY && gameboard[y-1][x+1] == EMPTY)
                                {
                                    current_shape.x_index[0] = current_shape.x_index[0] + 2; current_shape.y_index[0] = current_shape.y_index[0] + 0;
                                    current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                    current_shape.x_index[2] = current_shape.x_index[2] + 1; current_shape.y_index[2] = current_shape.y_index[2] + 1;
                                    current_shape.x_index[3] = current_shape.x_index[3] - 1; current_shape.y_index[3] = current_shape.y_index[3] + 1;
                                    current_shape.rotate_degree = NINETY_DEGREE;
                                }
                            }
                            /*   *****
                                 *   *
                                 * 0 *
                                 *   *
                             *********
                             *   *   *
                             * 1 * 2 *
                             *   *   *
                             *********
                               *   *
                             * 3 *
                             *   *
                             *****/
                            else if(current_shape.rotate_degree == NINETY_DEGREE)
                            {
                                if( (y-1) >= 0 && (x-1) >= 0 )
                                {
                                    if(gameboard[y-1][x] == EMPTY && gameboard[y-1][x-1] == EMPTY)
                                    {
                                        current_shape.x_index[0] = current_shape.x_index[0] - 2; current_shape.y_index[0] = current_shape.y_index[0] + 0;
                                        current_shape.x_index[1] = current_shape.x_index[1] + 0; current_shape.y_index[1] = current_shape.y_index[1] + 0;
                                        current_shape.x_index[2] = current_shape.x_index[2] - 1; current_shape.y_index[2] = current_shape.y_index[2] - 1;
                                        current_shape.x_index[3] = current_shape.x_index[3] + 1; current_shape.y_index[3] = current_shape.y_index[3] - 1;
                                        current_shape.rotate_degree = ZERO_DEGREE;
                                    }
                                }
                            }
                            /*********
                             *   *   *
                             * 0 * 2 *
                             *   *   *
                             *************
                                 *   *   *
                                 * 1 * 3 *
                                 *   *   *
                                 *********/
                            else console.log("ERROR in Z shape: No such rotating degree!");
                            break;
                        }
                    }
                }
                else if(keyIndex == DOWN)
                {
                    move_down_a_line(socket.id);
                }
                else if(keyIndex == LEFT)
                {
                    var isGoodToMoveLeft = true;
                    for(var i=0; i<NUMBER_OF_SQUARES_IN_SHAPE; i++)
                    {
                        var x = current_shape.x_index[i], y = current_shape.y_index[i];
                        if((x-1) < 0 || gameboard[y][x-1] != EMPTY)
                        {
                            isGoodToMoveLeft = false;
                            break;
                        }
                    }
                    if(isGoodToMoveLeft)
                    {
                        for(var i=0; i<NUMBER_OF_SQUARES_IN_SHAPE; i++)
                            current_shape.x_index[i]--;
                    }
                }
                else if(keyIndex == RIGHT)
                {
                    var isGoodToMoveRight = true;
                    for(var i=0; i<NUMBER_OF_SQUARES_IN_SHAPE; i++)
                    {
                        var x = current_shape.x_index[i], y = current_shape.y_index[i];
                        if((x+1) >= GAMEBOARD_LENGTH || gameboard[y][x+1] != EMPTY)
                        {
                            isGoodToMoveRight = false;
                            break;
                        }
                    }
                    if(isGoodToMoveRight)
                    {
                        for(var i=0; i<NUMBER_OF_SQUARES_IN_SHAPE; i++)
                            current_shape.x_index[i]++;
                    }
                }
            }
        }
    });
});

function move_down_a_line(socket_id)
{
    var gameboard = players_obj[socket_id].client_package.gameboard_data;
    var current_shape = players_obj[socket_id].client_package.current_shape;

    var isGoodToMoveDown = true;
    for(var i=0; i<NUMBER_OF_SQUARES_IN_SHAPE; i++)
    {
        var x = current_shape.x_index[i], y = current_shape.y_index[i];
        if((y+1) >= GAMEBOARD_WIDTH || gameboard[y+1][x] != EMPTY)
        {
            isGoodToMoveDown = false;
            break;
        }
    }

    if(isGoodToMoveDown)
    {
        for(var i=0; i<NUMBER_OF_SQUARES_IN_SHAPE; i++)
            current_shape.y_index[i]++;
    }
    else // the current shape is done, put the shape into the gameboard and load next shape
    {
        for(var i=0; i<NUMBER_OF_SQUARES_IN_SHAPE; i++)
        {
            var x = current_shape.x_index[i], y = current_shape.y_index[i];
            gameboard[y][x] = current_shape.color;
        }

        // check whether renew shape array
        // (not renew right now, just generated 50000 elements shape array in default, if it reaches the max, just loop again the array)

        // next shape
        players_obj[socket_id].shape_count = (players_obj[socket_id].shape_count+1) % NUMBER_OF_SHAPE_GENERATED;
        var next_shape_index = players_obj[socket_id].shape_count;
        // assign new shapes to the player
        players_obj[socket_id].client_package.current_shape = createShapeSquare(shape_array[next_shape_index]);
        players_obj[socket_id].client_package.next_shape = shape_array[players_obj[socket_id].shape_count + 1];

        // check whether the user is gameover
        var check_current_shape = players_obj[socket_id].client_package.current_shape;
        for(var i=0; i<NUMBER_OF_SQUARES_IN_SHAPE; i++)
        {
            var x = check_current_shape.x_index[i], y = check_current_shape.y_index[i];
            if(gameboard[y][x] != EMPTY)
            {
                players_obj[socket_id].client_package.gameover = true;
                for(var j=0; j<NUMBER_OF_SQUARES_IN_SHAPE; j++)
                    gameboard[check_current_shape.y_index[j]][check_current_shape.x_index[j]] = check_current_shape.color;
                break;
            }
        }
        // check whether the lines can be eliminated
        if(!players_obj[socket_id].client_package.gameover)
        {
            var eliminatedLines = 0;
            var checkNumOfLines = GAMEBOARD_WIDTH-1;
            while(true)
            {
                if(checkNumOfLines < 0) break;

                var i = checkNumOfLines;

                var isLineFull = true;
                for(var j=0; j<GAMEBOARD_LENGTH; j++) // check the specific row
                {
                    if(gameboard[i][j] == EMPTY)
                    {
                        isLineFull = false;
                        break;
                    }
                }

                if(isLineFull)
                {
                    // move all rows that is above the eliminated line a line down
                    for(var m=i-1; m>=0; m--)
                    {
                        for(var n=0; n<GAMEBOARD_LENGTH; n++)
                            gameboard[m+1][n] = gameboard[m][n];
                    }

                    for(var k=0; k<GAMEBOARD_LENGTH; k++) gameboard[0][k] = EMPTY; // the squares of the top row set to empty

                    eliminatedLines++;
                }
                else checkNumOfLines--; // check next line
            }
            players_obj[socket_id].client_package.lines += eliminatedLines;
            if(eliminatedLines == 4) players_obj[socket_id].client_package.tetris++;
            // adjust level
            if(players_obj[socket_id].client_package.level < 20)
            {
                players_obj[socket_id].next_level_line_count += eliminatedLines;
                if(players_obj[socket_id].next_level_line_count >= NEXT_LEVEL_REQUIRED_LINES[players_obj[socket_id].client_package.level])
                {
                    players_obj[socket_id].next_level_line_count -= NEXT_LEVEL_REQUIRED_LINES[players_obj[socket_id].client_package.level];
                    players_obj[socket_id].client_package.level++;
                    players_obj[socket_id].update_game_time = 0;
                }
            }
        }
        // check whether all players are gameover
        var isAllPlayerGameover = true;
        for(sock in players_obj)
        {
            if(!players_obj[sock].client_package.gameover)
            {
                isAllPlayerGameover = false;
                break;
            }
        }
        if(isAllPlayerGameover)
        {
            current_game_state = GAME_STATE_GAMEOVER;
            for(sock in players_obj) players_obj[sock].client_package.confirm = false; // reset players' confirm
        }
    }
}

function get_players_send_data(){ return Object.keys(players_obj).map(function(key){ return players_obj[key].client_package; }); }

function createShapeSquare(shape_data)
{
    var shape = new SHAPE();
    shape.color = shape_data.color;
    shape.type_of_shape = shape_data.shape;
    switch(shape.type_of_shape)
    {
        case SHARP_I:
            shape.x_index[0] = SHAPE_INITIAL_X_INDEX + 0; shape.y_index[0] = SHAPE_INITIAL_Y_INDEX + 0;
            shape.x_index[1] = SHAPE_INITIAL_X_INDEX + 1; shape.y_index[1] = SHAPE_INITIAL_Y_INDEX + 0;
            shape.x_index[2] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[2] = SHAPE_INITIAL_Y_INDEX + 0;
            shape.x_index[3] = SHAPE_INITIAL_X_INDEX + 3; shape.y_index[3] = SHAPE_INITIAL_Y_INDEX + 0;
            break;
        case SHARP_J:
            shape.x_index[0] = SHAPE_INITIAL_X_INDEX + 1; shape.y_index[0] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[1] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[1] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[2] = SHAPE_INITIAL_X_INDEX + 3; shape.y_index[2] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[3] = SHAPE_INITIAL_X_INDEX + 1; shape.y_index[3] = SHAPE_INITIAL_Y_INDEX + 0;
            break;
        case SHARP_L:
            shape.x_index[0] = SHAPE_INITIAL_X_INDEX + 1; shape.y_index[0] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[1] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[1] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[2] = SHAPE_INITIAL_X_INDEX + 3; shape.y_index[2] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[3] = SHAPE_INITIAL_X_INDEX + 3; shape.y_index[3] = SHAPE_INITIAL_Y_INDEX + 0;
            break;
        case SHARP_O:
            shape.x_index[0] = SHAPE_INITIAL_X_INDEX + 1; shape.y_index[0] = SHAPE_INITIAL_Y_INDEX + 0;
            shape.x_index[1] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[1] = SHAPE_INITIAL_Y_INDEX + 0;
            shape.x_index[2] = SHAPE_INITIAL_X_INDEX + 1; shape.y_index[2] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[3] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[3] = SHAPE_INITIAL_Y_INDEX + 1;
            break;
        case SHARP_S:
            shape.x_index[0] = SHAPE_INITIAL_X_INDEX + 1; shape.y_index[0] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[1] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[1] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[2] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[2] = SHAPE_INITIAL_Y_INDEX + 0;
            shape.x_index[3] = SHAPE_INITIAL_X_INDEX + 3; shape.y_index[3] = SHAPE_INITIAL_Y_INDEX + 0;
            break;
        case SHARP_T:
            shape.x_index[0] = SHAPE_INITIAL_X_INDEX + 1; shape.y_index[0] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[1] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[1] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[2] = SHAPE_INITIAL_X_INDEX + 3; shape.y_index[2] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[3] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[3] = SHAPE_INITIAL_Y_INDEX + 0;
            break;
        case SHARP_Z:
            shape.x_index[0] = SHAPE_INITIAL_X_INDEX + 1; shape.y_index[0] = SHAPE_INITIAL_Y_INDEX + 0;
            shape.x_index[1] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[1] = SHAPE_INITIAL_Y_INDEX + 1;
            shape.x_index[2] = SHAPE_INITIAL_X_INDEX + 2; shape.y_index[2] = SHAPE_INITIAL_Y_INDEX + 0;
            shape.x_index[3] = SHAPE_INITIAL_X_INDEX + 3; shape.y_index[3] = SHAPE_INITIAL_Y_INDEX + 1;
            break;
        default: alert("ERROR: TYPE OF SHAPE NOT FOUND!");
    }

    return shape;
}

setInterval(function(){
    // print frame time infomation on console for dubug purpose
    //console.log(update_frame_time);
    update_frame_time++;
    update_frame_time %= FPS;

    if(current_game_state == GAME_STATE_STARTING_COUNT)
    {
        update_count_down_time_frame++;
        if(update_count_down_time_frame >= 60)
        {
            if(current_count_second < 0)
            {
                display_count_down = "";
                for(sock in players_obj)
                {
                    players_obj[sock].client_package.current_shape = createShapeSquare(shape_array[0]);
                    players_obj[sock].client_package.next_shape = shape_array[1];
                    players_obj[sock].update_game_time = 0;
                }
                update_count_down_time_frame = 60;   // reset the time to 60 for next time use
                current_game_state = GAME_STATE_PLAYING;
            }
            else
            {
                var display_count_down = "";
                if(current_count_second == 5) display_count_down = "  5";
                else if(current_count_second == 4) display_count_down = "  4";
                else if(current_count_second == 3) display_count_down = "  3";
                else if(current_count_second == 2) display_count_down = "  2";
                else if(current_count_second == 1) display_count_down = "  1";
                if(current_count_second == 0) display_count_down = "GO!";
                update_count_down_time_frame = 0;
            }
            for(socket_id in players_obj)
                io.to(socket_id).emit('set state', current_game_state, update_frame_time, get_players_send_data(), display_count_down);
            current_count_second--;
        }
    }
    else if(current_game_state == GAME_STATE_PLAYING)
    {
        for(sock in players_obj)
        {
            players_obj[sock].update_game_time++;
            var current_level = players_obj[sock].client_package.level;
            if(!players_obj[sock].client_package.gameover)
            {
                if(players_obj[sock].update_game_time >= LEVEL_GAME_UPDATE_TIME[current_level])
                {
                    move_down_a_line(sock);   // force the shape moves down a line
                    players_obj[sock].update_game_time = 0;
                }
            }
            io.to(sock).emit('set state', current_game_state, update_frame_time, get_players_send_data(), '');
        }
    }
    else
    {
        for(socket_id in players_obj)
            io.to(socket_id).emit('set state', current_game_state, update_frame_time, get_players_send_data(), '');
    }

}, 1000/FPS);
