const { BotFrameworkAdapter, MemoryStorage, ConversationState, MessageFactory, CardFactory, ActionTypes } = require('botbuilder');
const restify = require('restify');
const dotEnv = require('dotenv');
const botbuilder_dialogs = require('botbuilder-dialogs');
const {ChoicePrompt} = require("botbuilder-dialogs");
const { LuisRecognizer } = require('botbuilder-ai');
var utils = require('./utils');

// Create server
let server = restify.createServer();
dotEnv.config();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log(`${server.name} listening to ${server.url}`);
});

// Create adapter
const adapter = new BotFrameworkAdapter({ 
    appId: '',//process.env.MICROSOFT_APP_ID, 
    appPassword: ''//process.env.MICROSOFT_APP_PASSWORD 
});

//configurar LUIS
const luisRecognizer = new LuisRecognizer({
    // You can use it by providing your LUIS subscription key
    appId: process.env.KBID,
    // replace subscriptionKey with your Authoring Key
    // your key is at https://www.luis.ai under User settings > Authoring Key 
    subscriptionKey: process.env.SUBSCRIPTION_KEY,
    // The serviceEndpoint URL begins with "https://<region>.api.cognitive.microsoft.com", where region is the region associated with the key you are using. Some examples of regions are `westus`, `westcentralus`, `eastus2`, and `southeastasia`.
    serviceEndpoint: process.env.LUIS_MODEL_URL
});
adapter.use(luisRecognizer);

// Add conversation state middleware
const conversationState = new ConversationState(new MemoryStorage());
adapter.use(conversationState);

//Instantiate dialogs object
const dialogs = new botbuilder_dialogs.DialogSet();
dialogs.add('textPrompt', new botbuilder_dialogs.TextPrompt());
dialogs.add('choicePrompt', new ChoicePrompt());

// Listen for incoming requests 
server.post('/api/messages', (req, res) => {
    // Route received request to adapter for processing
    adapter.processActivity(req, res, async (context) => {
        const state = conversationState.get(context);
        const dc = dialogs.createContext(context, state);
        if (context.activity.type === 'message') {
            // Retrieve the LUIS results from our LUIS application
            const luisResults = luisRecognizer.get(context);

            // Extract the top intent from LUIS and use it to select which dialog to start
            // "NotFound" is the intent name for when no top intent can be found.
            const topIntent = LuisRecognizer.topIntent(luisResults, "NotFound");

            const isMessage = context.activity.type === 'message';
            if (isMessage) {
                if(!state.conversationActive) {
                    switch (topIntent) {
                        case 'ComprarBoletos':
                            state.conversationActive = true;
                            await dc.begin('comprar_boletos', luisResults);
                            break;
                        case 'ConsultarPeliculas':
                            state.conversationActive = true;
                            await dc.begin('consultar_peliculas', luisResults);
                            break;
                        case 'Estrenos':
                            await dc.begin('consultar_estrenos', luisResults);
                            break;
                        case 'None':
                            await context.sendActivity('No te entendi');
                            break;
                        case 'null':
                            await context.sendActivity('Failed');
                            break;
                        default:
                            await context.sendActivity(`The top intent was ${topIntent}`);
                    }
                }
            }
            
            if (!context.responded) {
                await dc.continue();
                /*if (!context.responded && isMessage) {
                    await dc.context.sendActivity(`Hi! I'm the LUIS dialog bot. Say something and LUIS will decide how the message should be routed.`);
                }*/
            }
        }
        if(context.activity.type === 'conversationUpdate') {
            if(req._dtraceId === 1){
                var msg = `¡Hola! Qué gusto tenerte por aqui. :)	
                            <br/> Estoy aquí para ayudarte a hacer tu compra más ágil.`
                await context.sendActivity(msg);
                await dc.begin('intro');
            }
        }
    });
});

//Introduccion
dialogs.add('intro', [
    async (dc) => {
        const listOptions = ['Peliculas', 'Estrenos', 'Promociones', 'Combos'];
        await dc.prompt('choicePrompt', '¿En qué te puedo ayudar?', listOptions, {retryPrompt: 'Por favor selecciona una categoría'});
    }
]);

//Consultar peliculas
dialogs.add('consultar_peliculas', [
    async (dc, results, next) => {
        if(!conversationState.get(dc.context).selectedCinema) {
            await dc.begin('solicitar_ubicacion');
        }else{
            next();
        }
    },
    async (dc, results) => {
        let location = conversationState.get(dc.context).selectedCinema;
        await dc.context.sendActivity(`Estas son las peliculas para: ${location}`);

        let messageWithCarouselOfCards = MessageFactory.carousel([
            CardFactory.videoCard('Avengers', ['https://www.youtube.com/watch?v=QwievZ1Tx-8'], [{
                type: ActionTypes.ImBack,
                title: 'Comprar Boletos',
                value: 'Comprar boletos para Avengers'
            }]),
            CardFactory.videoCard('Civil War', ['https://www.youtube.com/watch?v=dKrVegVI0Us'], [{
                type: ActionTypes.ImBack,
                title: 'Comprar Boletos',
                value: 'Comprar boletos para Civil War'
            }]),
            CardFactory.videoCard('Black Panter', ['https://www.youtube.com/watch?v=xjDjIWPwcPU'], [{
                type: ActionTypes.ImBack,
                title: 'Comprar Boletos',
                value: 'Comprar boletos para Black Panter'
            }])
        ]);        
        await dc.context.sendActivity(messageWithCarouselOfCards);

        conversationState.get(dc.context).conversationActive = false;
        await dc.endAll();
    }
]);

//Comprar boletos
dialogs.add('comprar_boletos', [
    async (dc, results, next) => {
        const movies = utils.findEntities('Pelicula', results.entities);
        if(movies.length > 0){
            conversationState.get(dc.context).selectedMovie = movies[0];
            next();
        }else{
            await dc.begin('consultar_peliculas');
        }
    },
    async (dc, results, next) => {
        if(!conversationState.get(dc.context).selectedDay) {
            await dc.begin('solicitar_dia');
        }else{
            next();
        }
    },
    async (dc, results, next) => {
        if(!conversationState.get(dc.context).selectedTime) {
            await dc.begin('solicitar_horario');
        }else{
            next();
        }
    },
    async (dc, results, next) => {
        await dc.context.sendActivity('Comprando boletos');
        conversationState.get(dc.context).conversationActive = false;
        await dc.endAll();
    }
]);

//Solicitar dia
dialogs.add('solicitar_dia', [
    async (dc) => {
        const listOptions = ['Hoy', 'Mañana', 'Pasado mañana'];
        await dc.prompt('choicePrompt', '¿Para que día quieres los boletos?', listOptions, {retryPrompt: 'Por favor selecciona un día'});
    },
    async (dc, results) => {
        conversationState.get(dc.context).selectedDay = results.value;
        await dc.end();
    }
]);

//Solicitar horario
dialogs.add('solicitar_horario', [
    async (dc) => {
        const listOptions = ['10:00', '14:00', '18:00'];
        await dc.prompt('choicePrompt', '¿A que hora quieres ver la pelicula?', listOptions, {retryPrompt: 'Por favor selecciona un horario'});
    },
    async (dc, results) => {
        conversationState.get(dc.context).selectedTime = results.value;
        await dc.end();
    }
]);

//Consultar estrenos
dialogs.add('consultar_estrenos', [
    async (dc, results, next) => {
        console.log('estrenos', locations);
        await dc.end();
    }
]);

dialogs.add('solicitar_ubicacion', [
    async (dc) => {
        const listOptions = ['Toreo', 'Hollywood', 'Plaza Carso', 'VIP Plaza Carso'];
        await dc.prompt('choicePrompt', '¿En qué cine te gustaría asistir?', listOptions, {retryPrompt: 'Por favor selecciona una cine'});
    },
    async (dc, results) => {
        conversationState.get(dc.context).selectedCinema = results.value;
        await dc.end();
    }
]);

