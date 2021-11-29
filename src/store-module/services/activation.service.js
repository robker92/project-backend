// database operations
import {
    updateOneOperation,
    readOneOperation,
    databaseEntity,
} from '../../storage/database-operations';

export { storeActivationRoutine, activationStep };

const activationStep = Object.freeze({
    PROFILE_COMPLETE: 'profileComplete',
    MIN_ONE_PRODUCT: 'minOneProduct',
    SHIPPING_REGISTERED: 'shippingRegistered',
    PAYMENT_REGISTERED: 'paymentMethodRegistered',
});

/**
 * This is the main activation function, which is called whenever a relevant action took place which could affect the activation status of a store.
 * It checks first the activation status of every single step and then updates the general activation field.
 * @param {object} store
 * @param {string} mongoDbSession mongo db session if needed
 */
async function storeActivationRoutine(store, mongoDbSession = null) {
    if (!store) {
        // throw new Error(`Store with the id ${storeId} was not found.`);
        throw new Error(
            `No store was provided to check its activation status.`
        );
    }
    const storeId = store._id.toString();
    // PROFILE COMPLETE
    let profileCompleteValue;
    // Check the store's values and call the set methods accordingly
    if (checkProfileComplete(store)) {
        profileCompleteValue = true;
    } else {
        profileCompleteValue = false;
    }

    // MIN ONE PRODUCT
    let minOneProductValue;
    if (await checkMinOneProduct(storeId, mongoDbSession)) {
        minOneProductValue = true;
    } else {
        minOneProductValue = false;
    }

    // SHIPPING
    let shippingValue;
    if (checkShippingRegistered(store)) {
        shippingValue = true;
    } else {
        shippingValue = false;
    }

    // PAYMENT
    let paymentMethodValue;
    if (checkPaymentMethodRegistered(store)) {
        paymentMethodValue = true;
    } else {
        paymentMethodValue = false;
    }

    // get the value for the general actiovation status field
    const stepValueArray = [
        profileCompleteValue,
        minOneProductValue,
        shippingValue,
        paymentMethodValue,
    ];
    const activationValue = getGeneralActivationStatusValue(stepValueArray);

    // Build update object
    let updateObject = {};
    updateObject[`activationSteps.${activationStep.PROFILE_COMPLETE}`] =
        profileCompleteValue;
    updateObject[`activationSteps.${activationStep.MIN_ONE_PRODUCT}`] =
        minOneProductValue;
    updateObject[`activationSteps.${activationStep.SHIPPING_REGISTERED}`] =
        shippingValue;
    updateObject[`activationSteps.${activationStep.PAYMENT_REGISTERED}`] =
        paymentMethodValue;
    updateObject[`activation`] = activationValue;

    // Update the store's values
    await updateOneOperation(
        databaseEntity.STORES,
        {
            _id: storeId,
        },
        updateObject,
        'set',
        mongoDbSession
    );
}

/**
 * Checks every element in the array. If one of them is false, false is returned.
 * If all of them are true, true is returned
 * @param {array} valueArray boolean array
 * @returns boolean value
 */
function getGeneralActivationStatusValue(valueArray) {
    let resultValue = false;
    for (const value of valueArray) {
        if (!value) {
            resultValue = false;
            break;
        } else {
            resultValue = true;
        }
    }

    return resultValue;
}

// TODO
// Activation Step Validation Functions
function checkProfileComplete(store) {
    if (
        store.profileData.title.length < 10 ||
        store.profileData.title.length > 100
    ) {
        return false;
    }

    if (
        store.profileData.description.length < 100 ||
        store.profileData.description.length > 1000
    ) {
        return false;
    }

    if (
        store.profileData.tags.length < 1 ||
        store.profileData.tags.length > 15
    ) {
        return false;
    }

    // TODO Fetch images
    // if (
    //     store.profileData.images.length < 1 ||
    //     store.profileData.images.length > 10
    // ) {
    //     return false;
    // }

    return true;
}

async function checkMinOneProduct(storeId, mongoDbSession) {
    const product = await readOneOperation(
        databaseEntity.PRODUCTS,
        { storeId: storeId },
        { _id: 1 },
        mongoDbSession
    );
    if (!product) {
        return false;
    }
    return true;
}

// TODO
function checkShippingRegistered(store) {
    return true;
}

// TODO
function checkPaymentMethodRegistered(store) {
    // if (store.payment.registered) {
    //     return true;
    // }
    if (store.payment.paypal.common.merchantIdInPayPal) {
        return true;
    }
    return false;
}
