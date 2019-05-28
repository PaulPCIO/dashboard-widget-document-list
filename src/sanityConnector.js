import {of as observableOf} from 'rxjs'
import {switchMap, delay, tap, mergeMap} from 'rxjs/operators'
import {uniqBy} from 'lodash'
import client from 'part:@sanity/base/client'

const draftId = nonDraftDoc => `drafts.${nonDraftDoc._id}`

const prepareDocumentList = (sanityClient, incoming) => {
  if (!incoming) {
    return Promise.resolve([])
  }

  const documents = Array.isArray(incoming) ? incoming : [incoming]
  const ids = documents.filter(doc => !doc._id.startsWith('draft.')).map(draftId)

  return sanityClient
    .fetch('*[_id in $ids]', {ids})
    .then(drafts => {
      const outgoing = documents.map(doc => {
        const foundDraft = drafts.find(draft => draft._id === draftId(doc))
        return foundDraft || doc
      })
      return uniqBy(outgoing, '_id')
    })
    .catch(error => {
      throw new Error(`Problems fetching docs ${ids}. Error: ${error.message}`)
    })
}

const getSubscription = (query, params, apiVersion = '1') => {
  const sanityClient = client.withConfig ? client.withConfig({apiVersion}) : client
  return sanityClient
    .listen(query, params, {
      events: ['welcome', 'mutation'],
      includeResult: false,
      visibility: 'query'
    })
    .pipe(
      switchMap(event =>
        observableOf(1).pipe(
          event.type === 'welcome' ? tap() : delay(1000),
          mergeMap(() =>
            sanityClient
              .fetch(query, params)
              .then(incoming => prepareDocumentList(sanityClient, incoming))
              .catch(error => {
                if (error.message.startsWith('Problems fetching docs')) {
                  throw error
                }
                throw new Error(
                  `Query failed ${query} and ${JSON.stringify(params)}. Error: ${error.message}`
                )
              })
          )
        )
      )
    )
}

module.exports = {
  getSubscription
}
