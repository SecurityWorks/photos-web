import {
    getEndpoint,
    getFamilyPortalURL,
    isDevDeployment,
} from 'utils/common/apiUtil';
import { getData, LS_KEYS } from '@ente/shared/storage/localStorage';
import localForage from 'utils/storage/localForage';
import { getToken } from 'utils/common/key';
import HTTPService from './HTTPService';
import { getRecoveryKey } from 'utils/crypto';
import { logError } from '@ente/shared/sentry';
import {
    UserDetails,
    DeleteChallengeResponse,
    GetRemoteStoreValueResponse,
    GetFeatureFlagResponse,
} from 'types/user';
import { ApiError } from 'utils/error';
import { getLocalFamilyData, isPartOfFamily } from 'utils/user/family';
import { AxiosResponse, HttpStatusCode } from 'axios';
import { setLocalMapEnabled } from 'utils/storage';
import { putAttributes } from '@ente/accounts/api/user';
import { logoutUser } from '@ente/accounts/services/user';

const ENDPOINT = getEndpoint();

const HAS_SET_KEYS = 'hasSetKeys';

export const getPublicKey = async (email: string) => {
    const token = getToken();

    const resp = await HTTPService.get(
        `${ENDPOINT}/users/public-key`,
        { email },
        {
            'X-Auth-Token': token,
        }
    );
    return resp.data.publicKey;
};

export const getPaymentToken = async () => {
    const token = getToken();

    const resp = await HTTPService.get(
        `${ENDPOINT}/users/payment-token`,
        null,
        {
            'X-Auth-Token': token,
        }
    );
    return resp.data['paymentToken'];
};

export const getFamiliesToken = async () => {
    try {
        const token = getToken();

        const resp = await HTTPService.get(
            `${ENDPOINT}/users/families-token`,
            null,
            {
                'X-Auth-Token': token,
            }
        );
        return resp.data['familiesToken'];
    } catch (e) {
        logError(e, 'failed to get family token');
        throw e;
    }
};

export const getRoadmapRedirectURL = async () => {
    try {
        const token = getToken();

        const resp = await HTTPService.get(
            `${ENDPOINT}/users/roadmap/v2`,
            null,
            {
                'X-Auth-Token': token,
            }
        );
        return resp.data['url'];
    } catch (e) {
        logError(e, 'failed to get roadmap url');
        throw e;
    }
};

export const clearFiles = async () => {
    await localForage.clear();
};

export const isTokenValid = async (token: string) => {
    try {
        const resp = await HTTPService.get(
            `${ENDPOINT}/users/session-validity/v2`,
            null,
            {
                'X-Auth-Token': token,
            }
        );
        try {
            if (resp.data[HAS_SET_KEYS] === undefined) {
                throw Error('resp.data.hasSetKey undefined');
            }
            if (!resp.data['hasSetKeys']) {
                try {
                    await putAttributes(
                        token,
                        getData(LS_KEYS.ORIGINAL_KEY_ATTRIBUTES)
                    );
                } catch (e) {
                    logError(e, 'put attribute failed');
                }
            }
        } catch (e) {
            logError(e, 'hasSetKeys not set in session validity response');
        }
        return true;
    } catch (e) {
        logError(e, 'session-validity api call failed');
        if (
            e instanceof ApiError &&
            e.httpStatusCode === HttpStatusCode.Unauthorized
        ) {
            return false;
        } else {
            return true;
        }
    }
};

export const getTwoFactorStatus = async () => {
    const resp = await HTTPService.get(
        `${ENDPOINT}/users/two-factor/status`,
        null,
        {
            'X-Auth-Token': getToken(),
        }
    );
    return resp.data['status'];
};

export const _logout = async () => {
    if (!getToken()) return true;
    try {
        await HTTPService.post(`${ENDPOINT}/users/logout`, null, null, {
            'X-Auth-Token': getToken(),
        });
        return true;
    } catch (e) {
        logError(e, '/users/logout failed');
        return false;
    }
};

export const sendOTTForEmailChange = async (email: string) => {
    if (!getToken()) {
        return null;
    }
    await HTTPService.post(`${ENDPOINT}/users/ott`, {
        email,
        client: 'web',
        purpose: 'change',
    });
};

export const changeEmail = async (email: string, ott: string) => {
    if (!getToken()) {
        return null;
    }
    await HTTPService.post(
        `${ENDPOINT}/users/change-email`,
        {
            email,
            ott,
        },
        null,
        {
            'X-Auth-Token': getToken(),
        }
    );
};

export const getUserDetailsV2 = async (): Promise<UserDetails> => {
    try {
        const token = getToken();

        const resp = await HTTPService.get(
            `${ENDPOINT}/users/details/v2`,
            null,
            {
                'X-Auth-Token': token,
            }
        );
        return resp.data;
    } catch (e) {
        logError(e, 'failed to get user details v2');
        throw e;
    }
};

export const getFamilyPortalRedirectURL = async () => {
    try {
        const jwtToken = await getFamiliesToken();
        const isFamilyCreated = isPartOfFamily(getLocalFamilyData());
        return `${getFamilyPortalURL()}?token=${jwtToken}&isFamilyCreated=${isFamilyCreated}&redirectURL=${
            window.location.origin
        }/gallery`;
    } catch (e) {
        logError(e, 'unable to generate to family portal URL');
        throw e;
    }
};

export const getAccountDeleteChallenge = async () => {
    try {
        const token = getToken();

        const resp = await HTTPService.get(
            `${ENDPOINT}/users/delete-challenge`,
            null,
            {
                'X-Auth-Token': token,
            }
        );
        return resp.data as DeleteChallengeResponse;
    } catch (e) {
        logError(e, 'failed to get account delete challenge');
        throw e;
    }
};

export const deleteAccount = async (
    challenge: string,
    reason: string,
    feedback: string
) => {
    try {
        const token = getToken();
        if (!token) {
            return;
        }

        await HTTPService.delete(
            `${ENDPOINT}/users/delete`,
            { challenge, reason, feedback },
            null,
            {
                'X-Auth-Token': token,
            }
        );
    } catch (e) {
        logError(e, 'deleteAccount api call failed');
        throw e;
    }
};

// Ensure that the keys in local storage are not malformed by verifying that the
// recoveryKey can be decrypted with the masterKey.
// Note: This is not bullet-proof.
export const validateKey = async () => {
    try {
        await getRecoveryKey();
        return true;
    } catch (e) {
        await logoutUser();
        return false;
    }
};

export const getFaceSearchEnabledStatus = async () => {
    try {
        const token = getToken();
        const resp: AxiosResponse<GetRemoteStoreValueResponse> =
            await HTTPService.get(
                `${ENDPOINT}/remote-store`,
                {
                    key: 'faceSearchEnabled',
                    defaultValue: false,
                },
                {
                    'X-Auth-Token': token,
                }
            );
        return resp.data.value === 'true';
    } catch (e) {
        logError(e, 'failed to get face search enabled status');
        throw e;
    }
};

export const updateFaceSearchEnabledStatus = async (newStatus: boolean) => {
    try {
        const token = getToken();
        await HTTPService.post(
            `${ENDPOINT}/remote-store/update`,
            {
                key: 'faceSearchEnabled',
                value: newStatus.toString(),
            },
            null,
            {
                'X-Auth-Token': token,
            }
        );
    } catch (e) {
        logError(e, 'failed to update face search enabled status');
        throw e;
    }
};

export const syncMapEnabled = async () => {
    try {
        const status = await getMapEnabledStatus();
        setLocalMapEnabled(status);
    } catch (e) {
        logError(e, 'failed to sync map enabled status');
        throw e;
    }
};

export const getMapEnabledStatus = async () => {
    try {
        const token = getToken();
        const resp: AxiosResponse<GetRemoteStoreValueResponse> =
            await HTTPService.get(
                `${ENDPOINT}/remote-store`,
                {
                    key: 'mapEnabled',
                    defaultValue: false,
                },
                {
                    'X-Auth-Token': token,
                }
            );
        return resp.data.value === 'true';
    } catch (e) {
        logError(e, 'failed to get map enabled status');
        throw e;
    }
};

export const updateMapEnabledStatus = async (newStatus: boolean) => {
    try {
        const token = getToken();
        await HTTPService.post(
            `${ENDPOINT}/remote-store/update`,
            {
                key: 'mapEnabled',
                value: newStatus.toString(),
            },
            null,
            {
                'X-Auth-Token': token,
            }
        );
    } catch (e) {
        logError(e, 'failed to update map enabled status');
        throw e;
    }
};

export async function getDisableCFUploadProxyFlag(): Promise<boolean> {
    if (
        process.env
            .NEXT_PUBLIC_I_KNOW_WHAT_I_AM_DOING_DISABLE_CF_UPLOAD_PROXY ===
        'true'
    ) {
        return true;
    }

    try {
        const disableCFUploadProxy =
            process.env.NEXT_PUBLIC_DISABLE_CF_UPLOAD_PROXY;
        if (isDevDeployment() && typeof disableCFUploadProxy !== 'undefined') {
            return disableCFUploadProxy === 'true';
        }
        const featureFlags = (
            await fetch('https://static.ente.io/feature_flags.json')
        ).json() as GetFeatureFlagResponse;
        return featureFlags.disableCFUploadProxy;
    } catch (e) {
        logError(e, 'failed to get feature flags');
        return false;
    }
}
