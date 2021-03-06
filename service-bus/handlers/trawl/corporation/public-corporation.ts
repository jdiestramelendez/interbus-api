import Corporation from '../../../../shared/models/corporation'
import { getCorporation } from '../../../../shared/api/public/corporation'
import { IServiceBusActions, IServiceBusAction } from '../../../types'

export const trawl = async (corporationId: number): Promise<IServiceBusActions> => {
    const info = await getCorporation(corporationId)
    const insertData = {
        ...info.corporation,
        date_founded: new Date(info.corporation.date_founded)
    }

    const dbCorporation = await Corporation.query().findById(corporationId)

    const didChangeAlliance = dbCorporation?.alliance_id != info.corporation.alliance_id
    const isNewCorporation = !dbCorporation

    const corporation = await Corporation.query()
    .patchAndFetchById(corporationId, insertData)
    .then(data => {
        if (!data) {
            return Corporation.query().insertAndFetch({ ...insertData, id: corporationId })
        }
        return data
    })

    var d = new Date();
    d.setSeconds(d.getSeconds() - (60*60*6))
    const alliance = corporation?.alliance_id ? await Corporation.relatedQuery('alliance').for(corporation.id).where('updated_at', '>', d).first() : undefined
    const apiMessage: IServiceBusAction | undefined = alliance || !corporation.alliance_id ? undefined : { 
        group: "trawl",
        action: "alliance",
        data: { id: String(corporation.alliance_id) }
    }

    if (isNewCorporation || didChangeAlliance) {
        // do sync
    }

    return {
        api: [
            apiMessage
        ].filter(el => el)
    }
}
