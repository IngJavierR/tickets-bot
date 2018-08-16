const { BotFrameworkAdapter, MemoryStorage, ConversationState, MessageFactory } = require('botbuilder');
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
var initCounter = 0;

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
                            await context.sendActivity('Comprar boletos');
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
                if (!context.responded && isMessage) {
                    await dc.context.sendActivity(`Hi! I'm the LUIS dialog bot. Say something and LUIS will decide how the message should be routed.`);
                }
            }
        }
        if(context.activity.type === 'conversationUpdate') {
            if(initCounter === 0){
                initCounter++;
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
        await dc.begin('solicitar_ubicacion');
    },
    async (dc, results) => {
        await dc.context.sendActivity(`Buscare boletos para ${results.value}`);
        conversationState.get(dc.context).conversationState = false;
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
        await dc.end(results);
    }
]);

