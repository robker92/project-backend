'use strict';
import { switchCollections } from '../utils/switch-collections';
import { checkForObjectId } from '../utils/check-for-object-id';

export { readOneOperation };

/**
 * Fetches an entity from the database by the provided queryObject
 * @param {string} entity
 * @param {object} queryObject
 * @param {object} projectionObject
 * @returns the user or an empty object if nothing was not found
 */
async function readOneOperation(entity, queryObject, projectionObject = {}) {
    const collection = switchCollections(entity);

    queryObject = checkForObjectId(queryObject);

    const projection = { projection: projectionObject };
    const result = await collection.findOne(queryObject, projection);
    // const result = await collection.find(queryObject).project(projectionObject);
    return result;
}