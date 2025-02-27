import {SWSEItem} from "../item/item.mjs";
import {SWSEActor} from "../actor/actor.mjs";

export async function processActor(actorData) {
    let actors = await SWSEActor.create([actorData]);
    if (!(actors && actors.length === 1)) {
        return;
    }
    let actor = actors[0];
    let choiceAnswers = [];
    choiceAnswers.push(actor.system.size);
    let providedItems = actor.system.providedItems;
    delete actor.system.providedItems;
    actor.prepareData();
    actor.skipPrepare = true;
    await actor.addItems(providedItems, null, {
        skipPrerequisite: true,
        generalAnswers: choiceAnswers,
        isUpload: true,
        suppressWarnings: true
    });
    actor.skipPrepare = false;
    actor.prepareData();
    return actor;
}

export async function getFile(jsonImport) {
    let response = await fetch(jsonImport);
    if (response.status === 404) {
        return;
    }
    return response;
}

async function importCompendium(jsonImport, forceRefresh) {
    let response = await getFile(jsonImport);

    if(!response){
        console.warn("no content");
        return;
    }

    const content = await response.json();



    const compendiumName = content.name.replace(" ", "-");
    const entity = content.type;

    let pack = await game.packs.get(`world.${compendiumName.toLowerCase()}`);

    let toks = pack?.metadata.name.split("-");
    let version = toks ? toks[toks?.length - 1] : 0;
    if (!pack || (!isNaN(version) ? parseInt(version) : 0) < content.version || forceRefresh) {
        if (pack) {
            await pack.deleteCompendium()
        }
    } else {
        return;
    }

    let collection = await CompendiumCollection.createCompendium({
        label: compendiumName.toLowerCase(),
        name: compendiumName.toLowerCase(),
        type: entity,
        version: content.version
    });

    // await new Compendium(collection, {label: compendiumName, entity: entity, version: content.version})
    pack = await game.packs.get(`world.${compendiumName.toLowerCase()}`);
    //pack.metadata.version = content.version;

    if (!pack) {
        return;
    }

    console.log(`Generating ${compendiumName}... ${content.entries.length} entries`);
    ui.notifications.info(`Updating ${compendiumName}... ${content.entries.length} entries`);


    if ('Item' === entity) {
        let items = await SWSEItem.create(content.entries);
        for (let item of items) {
            for(let effect of item.effects){
                for(let link of effect.flags.swse.linkData || []){
                    let groupedEffects = item.effects.filter(effect => effect.flags.swse.group === link.group)
                    groupedEffects.forEach(e => e.addLinks(effect, link.type.toLowerCase()))
                    console.log(effect)
                }
                //delete effect.flags.swse.linkData
            }
            await collection.importDocument(item);
            item.delete();
        }
    } else if ('Actor' === entity) {
        for (let actorData of content.entries) {
            const actor = await processActor(actorData);
            if(!actor){
                continue;
            }
            await collection.importDocument(actor);
            if(actor.warnings && actor.warnings.length > 0){
                console.warn(actor, actor.warnings)
            }


            await actor.delete();
        }
    }
    // await pack.createEntity(content.entries);
    //Promise.all(promises).then(() => {
    console.log(`Done Generating ${compendiumName}... ${content.entries.length} entries`);
    ui.notifications.info(`Done Updating ${compendiumName}... ${content.entries.length} entries`);
//});
}

export const deleteEmptyCompendiums = async function () {
    await game.packs.forEach(p => {
        if (p.index.size === 0) {
            p.delete();
        }
    });
}

export const generateCompendiums = async function (forceRefresh = false, type = "Item") {
    console.log("Generating Compendiums...")
    let response;
    try {
        response = await fetch("systems/swse/raw_export/manifest.json");
    } catch (e) {
        return;
    }

    if (response.status === 404) {
        return;
    }
    const content = await response.json();

    for (const file of content.files) {
        await importCompendium(file, forceRefresh);
    }
    console.log("End Generation")
}