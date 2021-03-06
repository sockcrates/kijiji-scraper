// html-scraper.ts
/* Scrapes a Kijiji ad using the public-facing website */

import fetch from "node-fetch";
import cheerio from "cheerio";

import { BANNED, HTML_REQUEST_HEADERS } from "../constants";
import { cleanAdDescription, getLargeImageURL, isNumber } from "../helpers";
import { AdInfo } from "../scraper";

function castAttributeValue(value: string): boolean | number | Date | string {
    // Kijiji only returns strings. Convert to appropriate types
    value = value.trim();

    if (value.toLowerCase() === "true") {
        return true;
    } else if (value.toLowerCase() === "false") {
        return false;
    } else if (isNumber(value)) {
        return Number(value);
    } else if (!isNaN(Date.parse(value))) {
        return new Date(value);
    } else {
        return value;
    }
}

/* Parses the HTML of a Kijiji ad for its important information */
function parseResponseHTML(html: string): AdInfo | null {
    const info = new AdInfo();

    // Kijiji is nice and gives us an object containing ad info
    const $ = cheerio.load(html);
    let adData: any = {};
    let json = $("#FesLoader > script").text().replace("window.__data=", "");
    json = json.substring(0, json.length - 1);  // Remove trailing semicolon

    if (json.length === 0 || Object.keys(adData = JSON.parse(json)).length === 0 ||
        !adData.hasOwnProperty("config") || !adData.config.hasOwnProperty("adInfo") ||
        !adData.config.hasOwnProperty("VIP")) {
        return null;
    }

    adData = adData.config;
    info.title = adData.adInfo.title;
    info.description = cleanAdDescription(adData.VIP.description || "");
    info.date = new Date(adData.VIP.sortingDate);
    info.image = getLargeImageURL(adData.adInfo.sharingImageUrl || "");

    (adData.VIP.media || []).forEach((m: any) => {
        if (m.type === "image" && m.href && typeof m.href === "string") {
            info.images.push(getLargeImageURL(m.href));
        }
    });
    (adData.VIP.adAttributes || []).forEach((a: any) => {
        if (typeof a.machineKey === "string" && typeof a.machineValue === "string") {
            info.attributes[a.machineKey] = castAttributeValue(a.machineValue);
        }
    });

    // Add other attributes of interest
    // TODO: This VIP object contains much more. Worth a closer look.
    if (adData.VIP.price && typeof adData.VIP.price.amount === "number") {
        info.attributes["price"] = adData.VIP.price.amount/100.0;
    }
    if (adData.VIP.adLocation) {
        info.attributes["location"] = adData.VIP.adLocation;
    }
    if (adData.VIP.adType) {
        info.attributes["type"] = adData.VIP.adType;
    }
    if (adData.VIP.visitCounter) {
        info.attributes["visits"] = adData.VIP.visitCounter;
    }
    return info;
}

/* Scrapes the page at the passed Kijiji ad URL */
export function scrapeHTML(url: string): Promise<AdInfo | null> {
    return fetch(url, { headers: HTML_REQUEST_HEADERS })
            .then(res => {
                if (res.status === 403) {
                    throw new Error(BANNED);
                }
                return res.text();
            })
            .then(body => {
                return parseResponseHTML(body);
            });
}