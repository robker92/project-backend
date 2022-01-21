// https://developer.paypal.com/docs/checkout/reference/server-integration/set-up-transaction/
// https://developer.paypal.com/docs/platforms/checkout/configure-payments/multiseller-payments/
// https://developer.paypal.com/docs/checkout/reference/customize-sdk/

import { PAYPAL_PLATFORM_MERCHANT_ID, PAYPAL_PLATFORM_EMAIL, PLATFORM_FEE_RATE_DEFAULT } from '../../config';
import { readOneOperation, databaseEntity } from '../../storage/database-operations';
import {
    getShippingCostsService,
    calculateShippingCosts,
    getShippingCostForSingleStore,
} from '../../store-module/services/shipping.service';
import { hasValidProperty } from '../../utils/objectFunctions';
import { getStorePlatformFeeRate } from '../utils/order-utils';

/**
 * Returns the complete payload for the create order post request
 * @param {Object} orderObject order object which was just created (Get the order format { "storeId 1": [{product: "", amount: ""}, {product: "", amount: ""}], "storeId 2": [] })
 * @param {String} currencyCode
 * @param {Object} shippingAddress
 */
export async function getCreateOrderBody(orderObject, currencyCode, shippingAddress) {
    const purchaseUnitArray = await createPurchaseUnitArray(orderObject, currencyCode, shippingAddress);

    const body = {
        intent: 'CAPTURE',
        application_context: {
            // return_url: 'https://example.com',
            // cancel_url: 'https://example.com',
            brand_name: 'MySellum',
            landing_page: 'BILLING',
            shipping_preference: 'SET_PROVIDED_ADDRESS',
            user_action: 'CONTINUE',
        },
        purchase_units: purchaseUnitArray,
    };
    // console.log(JSON.stringify(body));
    return body;
}

/**
 * The function creates the purchase unit array. It will consist of one object for each store which is part of the order
 * @param {Object} orderObject order object which was just created
 * @param {String} currencyCode
 * @param {Object} shippingAddress
 */
async function createPurchaseUnitArray(orderObject, currencyCode, shippingAddress) {
    const purchaseUnitArray = [];
    const storeIds = Object.keys(orderObject);

    for (let i = 0; i < storeIds.length; i++) {
        const orderElement = orderObject[storeIds[i]];
        const productArray = orderElement.products;

        // TODO product tax rates

        const amountObject = createAmount(productArray, currencyCode, orderElement.store);
        const itemArray = createItemArray(productArray, currencyCode);
        const shippingObject = createShippingAddress(shippingAddress);
        const paymentInstructionObject = await createPaymentInstruction(
            amountObject.value,
            currencyCode,
            element.product.storeId
        );
        // create purchase unit object
        const purchaseUnitObject = {
            reference_id: `${storeIds[i]}~${i}`,
            // description: 'Sporting Goods',
            // custom_id: 'CUST-HighFashions',
            // soft_descriptor: 'HighFashions',
            payee: {
                // email_address: orderElement.store.merchantEmailInPayPal,
                merchant_id: orderElement.store.merchantIdInPayPal,
            },
            amount: amountObject,
            items: itemArray,
            shipping: shippingObject,
            payment_instruction: paymentInstructionObject,
        };

        purchaseUnitArray.push(purchaseUnitObject);
    }

    return purchaseUnitArray;
}

/**
 * Creates the items array for the purchase unit part of the body from the product object
 * @param {Array} productArray [{product: "", amount: 1}, {product: "", amount: 1}]
 * @param {String} currencyCode String like USD, EUR
 */
function createItemArray(productArray, currencyCode) {
    // Check the input array
    if (!Array.isArray(productArray)) {
        throw new Error('The productArray has to be an array.');
    }

    let items = [];
    for (const element of productArray) {
        const productTax = calculateProductTax(element.product.priceFloat);
        const productPrice = element.product.priceFloat - productTax;
        const item = {
            name: element.product.title,
            description: element.product.description,
            unit_amount: {
                currency_code: currencyCode,
                value: productPrice.toString(),
            },
            tax: {
                currency_code: currencyCode,
                value: productTax.toString(), //'5.00',
            },
            quantity: element.amount.toString(),
        };
        items.push(item);
    }

    return items;
}

function calculateProductTax(price) {
    // const taxRate = 0.19;
    const taxRate = 0.07;
    return (parseFloat(price) * taxRate).toFixed(2); // current tax rate: 19%
}

/**
 * The function takes the order data from the frontend and creates the amount object as it is required for paypal
 */
function createAmount(productArray, currencyCode, store) {
    // Check the input array
    if (!Array.isArray(productArray)) {
        throw new Error('The productArray has to be an array.');
    }

    // TODO check currency code
    const breakdownValues = calculateBreakdown(productArray, store);
    const amount = {
        currency_code: currencyCode,
        value: breakdownValues.totalSum,
        // If you specify amount.breakdown, the amount equals
        // item_total plus tax_total plus shipping plus handling plus insurance minus shipping_discount minus discount.
        breakdown: {
            item_total: {
                currency_code: currencyCode,
                value: breakdownValues.itemTotal,
            },
            shipping: {
                currency_code: currencyCode,
                value: breakdownValues.shippingCosts,
            },
            //     handling: {
            //         currency_code: 'EUR',
            //         value: '10.00',
            //     },
            tax_total: {
                currency_code: currencyCode,
                value: breakdownValues.taxTotal,
            },
            //     shipping_discount: {
            //         currency_code: 'EUR',
            //         value: '10',
            //     },
        },
    };

    console.log(amount);
    return amount;
}

/**
 * The function calculates the values for the breakdown object
 * @param {Array} productArray
 * @param {Object} store
 */
function calculateBreakdown(productArray, store) {
    // Check the input array
    if (!Array.isArray(productArray)) {
        throw new Error('The productArray has to be an array.');
    }

    let itemTotal = 0;
    let taxTotal = 0;
    // iterate over products and calculate itemTotal and taxTotal
    for (const item of productArray) {
        taxTotal = taxTotal + parseFloat(calculateProductTax(item.product.priceFloat) * parseInt(item.amount));
        itemTotal = itemTotal + item.product.priceFloat * parseInt(item.amount);
    }

    let shippingCosts = getShippingCostForSingleStore(store, productArray);
    console.log(`[SHIPPING] Costs are ${shippingCosts}`);

    const totalSum = (itemTotal + shippingCosts).toFixed(2);

    // subtract the tax from the item total
    itemTotal = itemTotal - taxTotal;
    taxTotal = taxTotal.toFixed(2);
    itemTotal = itemTotal.toFixed(2);
    shippingCosts = shippingCosts.toFixed(2);

    return { totalSum, itemTotal, taxTotal, shippingCosts };
}

/**
 * The function takes the order data from the frontend and creates the payment instruction object as it is required for paypal
 * @param {string | number} totalSum the total sum of the payment
 * @param {string} currencyCode the currency as string code
 * @param {string} storeId
 */
async function createPaymentInstruction(totalSum, currencyCode, storeId) {
    const floatTotalSum = parseFloat(totalSum);
    if (floatTotalSum < 0) {
        throw new Error('A negative total sum is not supported.');
    }

    const platformFeeRate = await getStorePlatformFeeRate(storeId);

    // const platformFeeRate = 0.1;
    const platformFeeValue = (floatTotalSum * platformFeeRate).toFixed(2);
    console.log(`Fee value: ${platformFeeValue}`);

    const paymentInstructionObject = {
        disbursement_mode: 'INSTANT',
        platform_fees: [
            {
                amount: {
                    currency_code: currencyCode,
                    value: platformFeeValue,
                },
                payee: {
                    merchant_id: PAYPAL_PLATFORM_MERCHANT_ID,
                    email_address: PAYPAL_PLATFORM_EMAIL,
                },
            },
        ],
    };

    return paymentInstructionObject;
}

/**
 * The function takes the address input from the frontend and creates the shippingAddress object as it is required for paypal
 * @param {Object} shippingAddress the input shipping address as it comes from the frontend
 */
function createShippingAddress(shippingAddress) {
    // Property validations
    if (!hasValidProperty(shippingAddress, 'firstName')) {
        throw new Error('No firstName was provided with the shipping address.');
    }
    if (!hasValidProperty(shippingAddress, 'lastName')) {
        throw new Error('No lastName was provided with the shipping address.');
    }
    if (!hasValidProperty(shippingAddress, 'addressLine1')) {
        throw new Error('No addressLine1 was provided with the shipping address.');
    }
    if (!hasValidProperty(shippingAddress, 'city')) {
        throw new Error('No city was provided with the shipping address.');
    }
    if (!hasValidProperty(shippingAddress, 'postcode')) {
        throw new Error('No postcode was provided with the shipping address.');
    }

    const shippingAddressObject = {
        // method: 'United States Postal Service',
        name: {
            full_name: `${shippingAddress.firstName} ${shippingAddress.lastName}`,
        },
        address: {
            address_line_1: shippingAddress.addressLine1,
            address_line_2: '', // For example, suite or apartment number.
            admin_area_2: shippingAddress.city, // Citys
            admin_area_1: '', // in Germany: states
            postal_code: shippingAddress.postcode,
            country_code: 'DE',
        },
    };

    return shippingAddressObject;
}

// function calculateAmountDetails(products, currencyCode) {
//     const breakdownObject = {
//         breakdown: {
//             item_total: {
//                 currency_code: 'EUR',
//                 value: '',
//             },
//         },
//     };

//     if (shippingCosts) {
//         breakdownObject.breakdown.shipping = {
//             currency_code: 'EUR',
//             value: shippingCosts,
//         };
//     }
//     if (handlingCosts) {
//         breakdownObject.breakdown.tax_total = {
//             currency_code: 'EUR',
//             value: taxTotal,
//         };
//     }
//     breakdownObject.breakdown.handling = {
//         currency_code: 'EUR',
//         value: handlingCosts,
//     };
//     if (shippingDiscount) {
//         breakdownObject.breakdown.shipping_discount = {
//             currency_code: 'EUR',
//             value: shippingDiscount,
//         };
//     }
//     delete details.shipping_discount;
//     return details;
// }

// return {
//     intent: 'CAPTURE',
//     purchase_units: [
//         {
//             amount: {
//                 currency_code: 'EUR',
//                 value: '100.00',
//             },
//             // payee: {
//             //     email_address: payeeEmailAddress,
//             // },
//             payment_instruction: {
//                 disbursement_mode: 'INSTANT',
//                 platform_fees: [
//                     {
//                         amount: {
//                             currency_code: 'EUR',
//                             value: '25.00',
//                         },
//                     },
//                 ],
//             },
//         },
//     ],
// };
