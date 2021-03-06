import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import ESIToken from '../shared/models/ESIToken'
import { Model, UniqueViolationError } from 'objection'
import Knex from 'knex'
import knexfile from '../knexfile'
import { getAndVerifyToken, InvalidTokenResponse, TokenExpiredError, IDiscordCookiePayload } from '../shared/authorization'
import TokenNotFoundError from '../shared/errors/TokenNotFoundError'
import DiscordToken from '../shared/models/DiscordToken'
import TokenOwnership from '../shared/models/TokenOwnership'
import { IServiceBusAction } from "../service-bus/types"

const knex = Knex(knexfile)

Model.knex(knex)

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const state = req.query.state
    const code = req.query.code
    if (!code || !state) {
        context.res = {
            status: 403,
            body: "Invalid authorization code"
        }
    }

    const cookieHeader = req.headers.cookie
    let discordToken: IDiscordCookiePayload
    try {
        discordToken = getAndVerifyToken(cookieHeader)
    } catch (err) {
        if (err instanceof TokenNotFoundError || err instanceof TokenExpiredError) { 
            context.res = InvalidTokenResponse
            return
        }
        throw err
    }
    
    const trx = await DiscordToken.startTransaction()
    let eveToken: ESIToken
    try {
        const discordUser = await DiscordToken.query(trx).findById([discordToken.discord_user_id, discordToken.guild])
        eveToken = await ESIToken.verify(code, trx)
        await discordUser.$relatedQuery('esi_tokens', trx).where('character_id', eveToken.character_id).delete()
        await discordUser.$relatedQuery('esi_tokens', trx).relate(eveToken).debug()
        await trx.commit()
    } catch (err) {
        await trx.rollback()
        throw err
    }

    context.res = {
        body: "Success! Return to discord."
    }

    const messages: Array<IServiceBusAction> = [
        {
            group: "trawl",
            action: "character",
            data: { id: eveToken.character_id }
        }
    ]
    
    context.bindings.serviceBusApiQueue = messages
};

export default httpTrigger;
