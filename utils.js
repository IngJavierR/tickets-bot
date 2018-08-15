var exports = module.exports = {};
// Helper function for finding a specified entity
// entityResults are the results from LuisRecognizer.get(context)
exports.findEntities = function(entityName, entityResults) {
    let entities = []
    if (entityName in entityResults) {
        entityResults[entityName].forEach(entity => {
            entities.push(entity);
        });
    }
    return entities.length > 0 ? entities : undefined;
}