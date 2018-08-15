const { BotFrameworkAdapter, MemoryStorage, ConversationState } = require('botbuilder');
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
const model = new LuisRecognizer({
    // You can use it by providing your LUIS subscription key
    appId: process.env.KBID,
    // replace subscriptionKey with your Authoring Key
    // your key is at https://www.luis.ai under User settings > Authoring Key 
    subscriptionKey: process.env.SUBSCRIPTION_KEY,
    // The serviceEndpoint URL begins with "https://<region>.api.cognitive.microsoft.com", where region is the region associated with the key you are using. Some examples of regions are `westus`, `westcentralus`, `eastus2`, and `southeastasia`.
    serviceEndpoint: process.env.LUIS_MODEL_URL
});
adapter.use(model);

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
        // State will store all of your information 
        const convo = conversationState.get(context);
        const dc = dialogs.createContext(context, convo);

        const isMessage = (context.activity.type === 'message');
        if (isMessage) {
            // Check for valid intents                
            const results = model.get(context);
            const topIntent = LuisRecognizer.topIntent(results);
            switch (topIntent) {
                case 'ComprarBoletos':
                    await context.sendActivity('Comprar boletos');
                    break;
                case 'ConsultarPeliculas':
                    await dc.begin('consultar_peliculas', results);
                    break;
                case 'Estrenos':
                    await dc.begin('consultar_estrenos', results);
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

        if(!context.responded){
            // Continue executing the "current" dialog, if any.
            await dc.continue();

            if(!context.responded && isMessage){
                // Default message
                await context.sendActivity("Que mas puedo hacer por ti?");
            }else {
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
    },
    async (dc, results) => {
        var option = results;
        await dc.end();
    }
]);

//Consultar peliculas
dialogs.add('consultar_peliculas', [
    async (dc, results, next) => {
        dc.begin('solicitar_ubicacion');

        const locations = utils.findEntities('Cine', results.entities);
        console.log('locations', locations);
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
    async (dc, results, next) => {
        
        var data = { method: "sendMessage", parameters: { text: "<b>Save time by sending us your current location.</b>", parse_mode: "HTML", reply_markup: { keyboard: [ [ { text: "Share location", request_location: true } ] ] } } };
        const message = new builder.Message(dc.context);
        message.setChannelData(data);
        dc.session.send(message);

        await dc.end();
    }
]);

