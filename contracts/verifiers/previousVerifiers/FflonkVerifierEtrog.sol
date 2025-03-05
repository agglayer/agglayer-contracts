// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract FflonkVerifierEtrog {
    uint32 constant n = 16_777_216; // Domain size

    // Verification Key data
    uint256 constant k1 = 2; // Plonk k1 multiplicative factor to force distinct cosets of H
    uint256 constant k2 = 3; // Plonk k2 multiplicative factor to force distinct cosets of H

    // OMEGAS
    // Omega, Omega^{1/3}
    uint256 constant w1 =
        5_709_868_443_893_258_075_976_348_696_661_355_716_898_495_876_243_883_251_619_397_131_511_003_808_859;
    uint256 constant wr =
        18_200_100_796_661_656_210_024_324_131_237_448_517_259_556_535_315_737_226_009_542_456_080_026_430_510;
    // Omega_3, Omega_3^2
    uint256 constant w3 =
        21_888_242_871_839_275_217_838_484_774_961_031_246_154_997_185_409_878_258_781_734_729_429_964_517_155;
    uint256 constant w3_2 =
        4_407_920_970_296_243_842_393_367_215_006_156_084_916_469_457_145_843_978_461;
    // Omega_4, Omega_4^2, Omega_4^3
    uint256 constant w4 =
        21_888_242_871_839_275_217_838_484_774_961_031_246_007_050_428_528_088_939_761_107_053_157_389_710_902;
    uint256 constant w4_2 =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_616;
    uint256 constant w4_3 =
        4_407_920_970_296_243_842_541_313_971_887_945_403_937_097_133_418_418_784_715;
    // Omega_8, Omega_8^2, Omega_8^3, Omega_8^4, Omega_8^5, Omega_8^6, Omega_8^7
    uint256 constant w8_1 =
        19_540_430_494_807_482_326_159_819_597_004_422_086_093_766_032_135_589_407_132_600_596_362_845_576_832;
    uint256 constant w8_2 =
        21_888_242_871_839_275_217_838_484_774_961_031_246_007_050_428_528_088_939_761_107_053_157_389_710_902;
    uint256 constant w8_3 =
        13_274_704_216_607_947_843_011_480_449_124_596_415_239_537_050_559_949_017_414_504_948_711_435_969_894;
    uint256 constant w8_4 =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_616;
    uint256 constant w8_5 =
        2_347_812_377_031_792_896_086_586_148_252_853_002_454_598_368_280_444_936_565_603_590_212_962_918_785;
    uint256 constant w8_6 =
        4_407_920_970_296_243_842_541_313_971_887_945_403_937_097_133_418_418_784_715;
    uint256 constant w8_7 =
        8_613_538_655_231_327_379_234_925_296_132_678_673_308_827_349_856_085_326_283_699_237_864_372_525_723;

    // Verifier preprocessed input C_0(x)·[1]_1
    uint256 constant C0x =
        7_005_013_949_998_269_612_234_996_630_658_580_519_456_097_203_281_734_268_590_713_858_661_772_481_668;
    uint256 constant C0y =
        869_093_939_501_355_406_318_588_453_775_243_436_758_538_662_501_260_653_214_950_591_532_352_435_323;

    // Verifier preprocessed input x·[1]_2
    uint256 constant X2x1 =
        21_831_381_940_315_734_285_607_113_342_023_901_060_522_397_560_371_972_897_001_948_545_212_302_161_822;
    uint256 constant X2x2 =
        17_231_025_384_763_736_816_414_546_592_865_244_497_437_017_442_647_097_510_447_326_538_965_263_639_101;
    uint256 constant X2y1 =
        2_388_026_358_213_174_446_665_280_700_919_698_872_609_886_601_280_537_296_205_114_254_867_301_080_648;
    uint256 constant X2y2 =
        11_507_326_595_632_554_467_052_522_095_592_665_270_651_932_854_513_688_777_769_618_397_986_436_103_170;

    // Scalar field size
    uint256 constant q =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;
    // Base field size
    uint256 constant qf =
        21_888_242_871_839_275_222_246_405_745_257_275_088_696_311_157_297_823_662_689_037_894_645_226_208_583;
    // [1]_1
    uint256 constant G1x = 1;
    uint256 constant G1y = 2;
    // [1]_2
    uint256 constant G2x1 =
        10_857_046_999_023_057_135_944_570_762_232_829_481_370_756_359_578_518_086_990_519_993_285_655_852_781;
    uint256 constant G2x2 =
        11_559_732_032_986_387_107_991_004_021_392_285_783_925_812_861_821_192_530_917_403_151_452_391_805_634;
    uint256 constant G2y1 =
        8_495_653_923_123_431_417_604_973_247_489_272_438_418_190_587_263_600_148_770_280_649_306_958_101_930;
    uint256 constant G2y2 =
        4_082_367_875_863_433_681_332_203_403_145_435_568_316_851_327_593_401_208_105_741_076_214_120_093_531;

    // Proof calldata
    // Byte offset of every parameter of the calldata
    // Polynomial commitments
    uint16 constant pC1 = 4 + 0; // [C1]_1
    uint16 constant pC2 = 4 + 32 * 2; // [C2]_1
    uint16 constant pW1 = 4 + 32 * 4; // [W]_1
    uint16 constant pW2 = 4 + 32 * 6; // [W']_1
    // Opening evaluations
    uint16 constant pEval_ql = 4 + 32 * 8; // q_L(xi)
    uint16 constant pEval_qr = 4 + 32 * 9; // q_R(xi)
    uint16 constant pEval_qm = 4 + 32 * 10; // q_M(xi)
    uint16 constant pEval_qo = 4 + 32 * 11; // q_O(xi)
    uint16 constant pEval_qc = 4 + 32 * 12; // q_C(xi)
    uint16 constant pEval_s1 = 4 + 32 * 13; // S_{sigma_1}(xi)
    uint16 constant pEval_s2 = 4 + 32 * 14; // S_{sigma_2}(xi)
    uint16 constant pEval_s3 = 4 + 32 * 15; // S_{sigma_3}(xi)
    uint16 constant pEval_a = 4 + 32 * 16; // a(xi)
    uint16 constant pEval_b = 4 + 32 * 17; // b(xi)
    uint16 constant pEval_c = 4 + 32 * 18; // c(xi)
    uint16 constant pEval_z = 4 + 32 * 19; // z(xi)
    uint16 constant pEval_zw = 4 + 32 * 20; // z_omega(xi)
    uint16 constant pEval_t1w = 4 + 32 * 21; // T_1(xi omega)
    uint16 constant pEval_t2w = 4 + 32 * 22; // T_2(xi omega)
    uint16 constant pEval_inv = 4 + 32 * 23; // inv(batch) sent by the prover to avoid any inverse calculation to save gas,
    // we check the correctness of the inv(batch) by computing batch
    // and checking inv(batch) * batch == 1

    // Memory data
    // Challenges
    uint16 constant pAlpha = 0; // alpha challenge
    uint16 constant pBeta = 32; // beta challenge
    uint16 constant pGamma = 64; // gamma challenge
    uint16 constant pY = 96; // y challenge
    uint16 constant pXiSeed = 128; // xi seed, from this value we compute xi = xiSeed^24
    uint16 constant pXiSeed2 = 160; // (xi seed)^2
    uint16 constant pXi = 192; // xi challenge

    // Roots
    // S_0 = roots_8(xi) = { h_0, h_0w_8, h_0w_8^2, h_0w_8^3, h_0w_8^4, h_0w_8^5, h_0w_8^6, h_0w_8^7 }
    uint16 constant pH0w8_0 = 224;
    uint16 constant pH0w8_1 = 256;
    uint16 constant pH0w8_2 = 288;
    uint16 constant pH0w8_3 = 320;
    uint16 constant pH0w8_4 = 352;
    uint16 constant pH0w8_5 = 384;
    uint16 constant pH0w8_6 = 416;
    uint16 constant pH0w8_7 = 448;

    // S_1 = roots_4(xi) = { h_1, h_1w_4, h_1w_4^2, h_1w_4^3 }
    uint16 constant pH1w4_0 = 480;
    uint16 constant pH1w4_1 = 512;
    uint16 constant pH1w4_2 = 544;
    uint16 constant pH1w4_3 = 576;

    // S_2 = roots_3(xi) U roots_3(xi omega)
    // roots_3(xi) = { h_2, h_2w_3, h_2w_3^2 }
    uint16 constant pH2w3_0 = 608;
    uint16 constant pH2w3_1 = 640;
    uint16 constant pH2w3_2 = 672;
    // roots_3(xi omega) = { h_3, h_3w_3, h_3w_3^2 }
    uint16 constant pH3w3_0 = 704;
    uint16 constant pH3w3_1 = 736;
    uint16 constant pH3w3_2 = 768;

    uint16 constant pPi = 800; // PI(xi)
    uint16 constant pR0 = 832; // r0(y)
    uint16 constant pR1 = 864; // r1(y)
    uint16 constant pR2 = 896; // r2(y)

    uint16 constant pF = 928; // [F]_1, 64 bytes
    uint16 constant pE = 992; // [E]_1, 64 bytes
    uint16 constant pJ = 1056; // [J]_1, 64 bytes

    uint16 constant pZh = 1184; // Z_H(xi)
    // From this point we write all the variables that must be computed using the Montgomery batch inversion
    uint16 constant pZhInv = 1216; // 1/Z_H(xi)
    uint16 constant pDenH1 = 1248; // 1/( (y-h_1w_4) (y-h_1w_4^2) (y-h_1w_4^3) (y-h_1w_4^4) )
    uint16 constant pDenH2 = 1280; // 1/( (y-h_2w_3) (y-h_2w_3^2) (y-h_2w_3^3) (y-h_3w_3) (y-h_3w_3^2) (y-h_3w_3^3) )
    uint16 constant pLiS0Inv = 1312; // Reserve 8 * 32 bytes to compute r_0(X)
    uint16 constant pLiS1Inv = 1568; // Reserve 4 * 32 bytes to compute r_1(X)
    uint16 constant pLiS2Inv = 1696; // Reserve 6 * 32 bytes to compute r_2(X)
    // Lagrange evaluations

    uint16 constant pEval_l1 = 1888;

    uint16 constant lastMem = 1920;

    function verifyProof(
        bytes32[24] calldata proof,
        uint256[1] calldata pubSignals
    ) public view returns (bool) {
        assembly {
            // Computes the inverse of an array of values
            // See https://vitalik.ca/general/2018/07/21/starks_part_3.html in section where explain fields operations
            // To save the inverse to be computed on chain the prover sends the inverse as an evaluation in commits.eval_inv
            function inverseArray(pMem) {
                let pAux := mload(0x40) // Point to the next free position
                let acc := mload(add(pMem, pZhInv)) // Read the first element
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, pDenH1)), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, pDenH2)), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, pLiS0Inv)), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 32))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 64))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 96))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 128))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 160))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 192))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 224))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, pLiS1Inv)), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS1Inv, 32))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS1Inv, 64))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS1Inv, 96))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, pLiS2Inv)), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS2Inv, 32))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS2Inv, 64))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS2Inv, 96))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS2Inv, 128))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, add(pLiS2Inv, 160))), q)
                mstore(pAux, acc)

                pAux := add(pAux, 32)
                acc := mulmod(acc, mload(add(pMem, pEval_l1)), q)
                mstore(pAux, acc)

                let inv := calldataload(pEval_inv)

                // Before using the inverse sent by the prover the verifier checks inv(batch) * batch === 1
                if iszero(eq(1, mulmod(acc, inv, q))) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                acc := inv

                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, pEval_l1)), q)
                mstore(add(pMem, pEval_l1), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS2Inv, 160))), q)
                mstore(add(pMem, add(pLiS2Inv, 160)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS2Inv, 128))), q)
                mstore(add(pMem, add(pLiS2Inv, 128)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS2Inv, 96))), q)
                mstore(add(pMem, add(pLiS2Inv, 96)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS2Inv, 64))), q)
                mstore(add(pMem, add(pLiS2Inv, 64)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS2Inv, 32))), q)
                mstore(add(pMem, add(pLiS2Inv, 32)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, pLiS2Inv)), q)
                mstore(add(pMem, pLiS2Inv), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS1Inv, 96))), q)
                mstore(add(pMem, add(pLiS1Inv, 96)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS1Inv, 64))), q)
                mstore(add(pMem, add(pLiS1Inv, 64)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS1Inv, 32))), q)
                mstore(add(pMem, add(pLiS1Inv, 32)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, pLiS1Inv)), q)
                mstore(add(pMem, pLiS1Inv), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 224))), q)
                mstore(add(pMem, add(pLiS0Inv, 224)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 192))), q)
                mstore(add(pMem, add(pLiS0Inv, 192)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 160))), q)
                mstore(add(pMem, add(pLiS0Inv, 160)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 128))), q)
                mstore(add(pMem, add(pLiS0Inv, 128)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 96))), q)
                mstore(add(pMem, add(pLiS0Inv, 96)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 64))), q)
                mstore(add(pMem, add(pLiS0Inv, 64)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, add(pLiS0Inv, 32))), q)
                mstore(add(pMem, add(pLiS0Inv, 32)), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, pLiS0Inv)), q)
                mstore(add(pMem, pLiS0Inv), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, pDenH2)), q)
                mstore(add(pMem, pDenH2), inv)
                pAux := sub(pAux, 32)
                inv := mulmod(acc, mload(pAux), q)
                acc := mulmod(acc, mload(add(pMem, pDenH1)), q)
                mstore(add(pMem, pDenH1), inv)

                mstore(add(pMem, pZhInv), acc)
            }

            function checkField(v) {
                if iszero(lt(v, q)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPointBelongsToBN128Curve(p) {
                let x := calldataload(p)
                let y := calldataload(add(p, 32))

                // Check that the point is on the curve
                // y^2 = x^3 + 3
                let x3_3 := addmod(mulmod(x, mulmod(x, x, qf), qf), 3, qf)
                let y2 := mulmod(y, y, qf)

                if iszero(eq(x3_3, y2)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            // Validate all the evaluations sent by the prover ∈ F
            function checkInput() {
                // Check proof commitments fullfill bn128 curve equation Y^2 = X^3 + 3
                checkPointBelongsToBN128Curve(pC1)
                checkPointBelongsToBN128Curve(pC2)
                checkPointBelongsToBN128Curve(pW1)
                checkPointBelongsToBN128Curve(pW2)

                checkField(calldataload(pEval_ql))
                checkField(calldataload(pEval_qr))
                checkField(calldataload(pEval_qm))
                checkField(calldataload(pEval_qo))
                checkField(calldataload(pEval_qc))
                checkField(calldataload(pEval_s1))
                checkField(calldataload(pEval_s2))
                checkField(calldataload(pEval_s3))
                checkField(calldataload(pEval_a))
                checkField(calldataload(pEval_b))
                checkField(calldataload(pEval_c))
                checkField(calldataload(pEval_z))
                checkField(calldataload(pEval_zw))
                checkField(calldataload(pEval_t1w))
                checkField(calldataload(pEval_t2w))
                checkField(calldataload(pEval_inv))

                // Points are checked in the point operations precompiled smart contracts
            }

            function computeChallenges(pMem, pPublic) {
                // Compute challenge.beta & challenge.gamma
                mstore(add(pMem, 1920), C0x)
                mstore(add(pMem, 1952), C0y)

                mstore(add(pMem, 1984), calldataload(pPublic))

                mstore(add(pMem, 2016), calldataload(pC1))
                mstore(add(pMem, 2048), calldataload(add(pC1, 32)))

                mstore(
                    add(pMem, pBeta),
                    mod(keccak256(add(pMem, lastMem), 160), q)
                )
                mstore(
                    add(pMem, pGamma),
                    mod(keccak256(add(pMem, pBeta), 32), q)
                )

                // Get xiSeed & xiSeed2
                mstore(add(pMem, lastMem), mload(add(pMem, pGamma)))
                mstore(add(pMem, 1952), calldataload(pC2))
                mstore(add(pMem, 1984), calldataload(add(pC2, 32)))
                let xiSeed := mod(keccak256(add(pMem, lastMem), 96), q)

                mstore(add(pMem, pXiSeed), xiSeed)
                mstore(add(pMem, pXiSeed2), mulmod(xiSeed, xiSeed, q))

                // Compute roots.S0.h0w8
                mstore(
                    add(pMem, pH0w8_0),
                    mulmod(
                        mload(add(pMem, pXiSeed2)),
                        mload(add(pMem, pXiSeed)),
                        q
                    )
                )
                mstore(
                    add(pMem, pH0w8_1),
                    mulmod(mload(add(pMem, pH0w8_0)), w8_1, q)
                )
                mstore(
                    add(pMem, pH0w8_2),
                    mulmod(mload(add(pMem, pH0w8_0)), w8_2, q)
                )
                mstore(
                    add(pMem, pH0w8_3),
                    mulmod(mload(add(pMem, pH0w8_0)), w8_3, q)
                )
                mstore(
                    add(pMem, pH0w8_4),
                    mulmod(mload(add(pMem, pH0w8_0)), w8_4, q)
                )
                mstore(
                    add(pMem, pH0w8_5),
                    mulmod(mload(add(pMem, pH0w8_0)), w8_5, q)
                )
                mstore(
                    add(pMem, pH0w8_6),
                    mulmod(mload(add(pMem, pH0w8_0)), w8_6, q)
                )
                mstore(
                    add(pMem, pH0w8_7),
                    mulmod(mload(add(pMem, pH0w8_0)), w8_7, q)
                )

                // Compute roots.S1.h1w4
                mstore(
                    add(pMem, pH1w4_0),
                    mulmod(
                        mload(add(pMem, pH0w8_0)),
                        mload(add(pMem, pH0w8_0)),
                        q
                    )
                )
                mstore(
                    add(pMem, pH1w4_1),
                    mulmod(mload(add(pMem, pH1w4_0)), w4, q)
                )
                mstore(
                    add(pMem, pH1w4_2),
                    mulmod(mload(add(pMem, pH1w4_0)), w4_2, q)
                )
                mstore(
                    add(pMem, pH1w4_3),
                    mulmod(mload(add(pMem, pH1w4_0)), w4_3, q)
                )

                // Compute roots.S2.h2w3
                mstore(
                    add(pMem, pH2w3_0),
                    mulmod(
                        mload(add(pMem, pH1w4_0)),
                        mload(add(pMem, pXiSeed2)),
                        q
                    )
                )
                mstore(
                    add(pMem, pH2w3_1),
                    mulmod(mload(add(pMem, pH2w3_0)), w3, q)
                )
                mstore(
                    add(pMem, pH2w3_2),
                    mulmod(mload(add(pMem, pH2w3_0)), w3_2, q)
                )

                // Compute roots.S2.h2w3
                mstore(
                    add(pMem, pH3w3_0),
                    mulmod(mload(add(pMem, pH2w3_0)), wr, q)
                )
                mstore(
                    add(pMem, pH3w3_1),
                    mulmod(mload(add(pMem, pH3w3_0)), w3, q)
                )
                mstore(
                    add(pMem, pH3w3_2),
                    mulmod(mload(add(pMem, pH3w3_0)), w3_2, q)
                )

                let xin := mulmod(
                    mulmod(
                        mload(add(pMem, pH2w3_0)),
                        mload(add(pMem, pH2w3_0)),
                        q
                    ),
                    mload(add(pMem, pH2w3_0)),
                    q
                )
                mstore(add(pMem, pXi), xin)

                // Compute xi^n

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mulmod(xin, xin, q)

                xin := mod(add(sub(xin, 1), q), q)
                mstore(add(pMem, pZh), xin)
                mstore(add(pMem, pZhInv), xin) // We will invert later together with lagrange pols

                // Compute challenge.alpha
                mstore(add(pMem, lastMem), xiSeed)

                calldatacopy(add(pMem, 1952), pEval_ql, 480)
                mstore(
                    add(pMem, pAlpha),
                    mod(keccak256(add(pMem, lastMem), 512), q)
                )

                // Compute challenge.y
                mstore(add(pMem, lastMem), mload(add(pMem, pAlpha)))
                mstore(add(pMem, 1952), calldataload(pW1))
                mstore(add(pMem, 1984), calldataload(add(pW1, 32)))
                mstore(add(pMem, pY), mod(keccak256(add(pMem, lastMem), 96), q))
            }

            function computeLiS0(pMem) {
                let root0 := mload(add(pMem, pH0w8_0))
                let y := mload(add(pMem, pY))
                let den1 := 1
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)

                den1 := mulmod(8, den1, q)

                let den2 := mload(
                    add(pMem, add(pH0w8_0, mul(mod(mul(7, 0), 8), 32)))
                )
                let den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(0, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS0Inv, 0)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH0w8_0, mul(mod(mul(7, 1), 8), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(1, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS0Inv, 32)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH0w8_0, mul(mod(mul(7, 2), 8), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(2, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS0Inv, 64)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH0w8_0, mul(mod(mul(7, 3), 8), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(3, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS0Inv, 96)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH0w8_0, mul(mod(mul(7, 4), 8), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(4, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS0Inv, 128)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH0w8_0, mul(mod(mul(7, 5), 8), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(5, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS0Inv, 160)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH0w8_0, mul(mod(mul(7, 6), 8), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(6, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS0Inv, 192)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH0w8_0, mul(mod(mul(7, 7), 8), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH0w8_0, mul(7, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS0Inv, 224)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )
            }

            function computeLiS1(pMem) {
                let root0 := mload(add(pMem, pH1w4_0))
                let y := mload(add(pMem, pY))
                let den1 := 1
                den1 := mulmod(den1, root0, q)
                den1 := mulmod(den1, root0, q)

                den1 := mulmod(4, den1, q)

                let den2 := mload(
                    add(pMem, add(pH1w4_0, mul(mod(mul(3, 0), 4), 32)))
                )
                let den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH1w4_0, mul(0, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS1Inv, 0)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH1w4_0, mul(mod(mul(3, 1), 4), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH1w4_0, mul(1, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS1Inv, 32)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH1w4_0, mul(mod(mul(3, 2), 4), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH1w4_0, mul(2, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS1Inv, 64)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH1w4_0, mul(mod(mul(3, 3), 4), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH1w4_0, mul(3, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS1Inv, 96)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )
            }

            function computeLiS2(pMem) {
                let y := mload(add(pMem, pY))

                let den1 := mulmod(
                    mulmod(3, mload(add(pMem, pH2w3_0)), q),
                    addmod(
                        mload(add(pMem, pXi)),
                        mod(sub(q, mulmod(mload(add(pMem, pXi)), w1, q)), q),
                        q
                    ),
                    q
                )

                let den2 := mload(
                    add(pMem, add(pH2w3_0, mul(mod(mul(2, 0), 3), 32)))
                )
                let den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH2w3_0, mul(0, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS2Inv, 0)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH2w3_0, mul(mod(mul(2, 1), 3), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH2w3_0, mul(1, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS2Inv, 32)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH2w3_0, mul(mod(mul(2, 2), 3), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH2w3_0, mul(2, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS2Inv, 64)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den1 := mulmod(
                    mulmod(3, mload(add(pMem, pH3w3_0)), q),
                    addmod(
                        mulmod(mload(add(pMem, pXi)), w1, q),
                        mod(sub(q, mload(add(pMem, pXi))), q),
                        q
                    ),
                    q
                )

                den2 := mload(
                    add(pMem, add(pH3w3_0, mul(mod(mul(2, 0), 3), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH3w3_0, mul(0, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS2Inv, 96)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH3w3_0, mul(mod(mul(2, 1), 3), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH3w3_0, mul(1, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS2Inv, 128)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )

                den2 := mload(
                    add(pMem, add(pH3w3_0, mul(mod(mul(2, 2), 3), 32)))
                )
                den3 := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, add(pH3w3_0, mul(2, 32))))), q),
                    q
                )

                mstore(
                    add(pMem, add(pLiS2Inv, 160)),
                    mulmod(den1, mulmod(den2, den3, q), q)
                )
            }

            // Prepare all the denominators that must be inverted, placed them in consecutive memory addresses
            function computeInversions(pMem) {
                // 1/ZH(xi) used in steps 8 and 9 of the verifier to multiply by 1/Z_H(xi)
                // Value computed during computeChallenges function and stores in pMem+pZhInv

                // 1/((y - h1) (y - h1w4) (y - h1w4_2) (y - h1w4_3))
                // used in steps 10 and 11 of the verifier
                let y := mload(add(pMem, pY))
                let w := addmod(y, mod(sub(q, mload(add(pMem, pH1w4_0))), q), q)
                w := mulmod(
                    w,
                    addmod(y, mod(sub(q, mload(add(pMem, pH1w4_1))), q), q),
                    q
                )
                w := mulmod(
                    w,
                    addmod(y, mod(sub(q, mload(add(pMem, pH1w4_2))), q), q),
                    q
                )
                w := mulmod(
                    w,
                    addmod(y, mod(sub(q, mload(add(pMem, pH1w4_3))), q), q),
                    q
                )
                mstore(add(pMem, pDenH1), w)

                // 1/((y - h2) (y - h2w3) (y - h2w3_2) (y - h3) (y - h3w3) (y - h3w3_2))
                w := addmod(y, mod(sub(q, mload(add(pMem, pH2w3_0))), q), q)
                w := mulmod(
                    w,
                    addmod(y, mod(sub(q, mload(add(pMem, pH2w3_1))), q), q),
                    q
                )
                w := mulmod(
                    w,
                    addmod(y, mod(sub(q, mload(add(pMem, pH2w3_2))), q), q),
                    q
                )
                w := mulmod(
                    w,
                    addmod(y, mod(sub(q, mload(add(pMem, pH3w3_0))), q), q),
                    q
                )
                w := mulmod(
                    w,
                    addmod(y, mod(sub(q, mload(add(pMem, pH3w3_1))), q), q),
                    q
                )
                w := mulmod(
                    w,
                    addmod(y, mod(sub(q, mload(add(pMem, pH3w3_2))), q), q),
                    q
                )
                mstore(add(pMem, pDenH2), w)

                // Denominator needed in the verifier when computing L_i^{S0}(X)
                computeLiS0(pMem)

                // Denominator needed in the verifier when computing L_i^{S1}(X)
                computeLiS1(pMem)

                // Denominator needed in the verifier when computing L_i^{S2}(X)
                computeLiS2(pMem)

                // L_i where i from 1 to num public inputs, needed in step 6 and 7 of the verifier to compute L_1(xi) and PI(xi)
                w := 1
                let xi := mload(add(pMem, pXi))

                mstore(
                    add(pMem, pEval_l1),
                    mulmod(n, mod(add(sub(xi, w), q), q), q)
                )

                // Execute Montgomery batched inversions of the previous prepared values
                inverseArray(pMem)
            }

            // Compute Lagrange polynomial evaluation L_i(xi)
            function computeLagrange(pMem) {
                let zh := mload(add(pMem, pZh))
                let w := 1

                mstore(
                    add(pMem, pEval_l1),
                    mulmod(mload(add(pMem, pEval_l1)), zh, q)
                )
            }

            // Compute public input polynomial evaluation PI(xi)
            function computePi(pMem, pPub) {
                let pi := 0
                pi := mod(
                    add(
                        sub(
                            pi,
                            mulmod(
                                mload(add(pMem, pEval_l1)),
                                calldataload(pPub),
                                q
                            )
                        ),
                        q
                    ),
                    q
                )

                mstore(add(pMem, pPi), pi)
            }

            // Compute r0(y) by interpolating the polynomial r0(X) using 8 points (x,y)
            // where x = {h9, h0w8, h0w8^2, h0w8^3, h0w8^4, h0w8^5, h0w8^6, h0w8^7}
            // and   y = {C0(h0), C0(h0w8), C0(h0w8^2), C0(h0w8^3), C0(h0w8^4), C0(h0w8^5), C0(h0w8^6), C0(h0w8^7)}
            // and computing C0(xi)
            function computeR0(pMem) {
                let num := 1
                let y := mload(add(pMem, pY))
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)

                num := addmod(num, mod(sub(q, mload(add(pMem, pXi))), q), q)

                let res
                let h0w80
                let c0Value
                let h0w8i

                // Compute c0Value = ql + (h0w8i) qr + (h0w8i)^2 qo + (h0w8i)^3 qm + (h0w8i)^4 qc +
                //                      + (h0w8i)^5 S1 + (h0w8i)^6 S2 + (h0w8i)^7 S3
                h0w80 := mload(add(pMem, pH0w8_0))
                c0Value := addmod(
                    calldataload(pEval_ql),
                    mulmod(calldataload(pEval_qr), h0w80, q),
                    q
                )
                h0w8i := mulmod(h0w80, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qo), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qm), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qc), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s1), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s2), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s3), h0w8i, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c0Value,
                        mulmod(num, mload(add(pMem, add(pLiS0Inv, 0))), q),
                        q
                    ),
                    q
                )

                // Compute c0Value = ql + (h0w8i) qr + (h0w8i)^2 qo + (h0w8i)^3 qm + (h0w8i)^4 qc +
                //                      + (h0w8i)^5 S1 + (h0w8i)^6 S2 + (h0w8i)^7 S3
                h0w80 := mload(add(pMem, pH0w8_1))
                c0Value := addmod(
                    calldataload(pEval_ql),
                    mulmod(calldataload(pEval_qr), h0w80, q),
                    q
                )
                h0w8i := mulmod(h0w80, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qo), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qm), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qc), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s1), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s2), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s3), h0w8i, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c0Value,
                        mulmod(num, mload(add(pMem, add(pLiS0Inv, 32))), q),
                        q
                    ),
                    q
                )

                // Compute c0Value = ql + (h0w8i) qr + (h0w8i)^2 qo + (h0w8i)^3 qm + (h0w8i)^4 qc +
                //                      + (h0w8i)^5 S1 + (h0w8i)^6 S2 + (h0w8i)^7 S3
                h0w80 := mload(add(pMem, pH0w8_2))
                c0Value := addmod(
                    calldataload(pEval_ql),
                    mulmod(calldataload(pEval_qr), h0w80, q),
                    q
                )
                h0w8i := mulmod(h0w80, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qo), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qm), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qc), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s1), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s2), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s3), h0w8i, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c0Value,
                        mulmod(num, mload(add(pMem, add(pLiS0Inv, 64))), q),
                        q
                    ),
                    q
                )

                // Compute c0Value = ql + (h0w8i) qr + (h0w8i)^2 qo + (h0w8i)^3 qm + (h0w8i)^4 qc +
                //                      + (h0w8i)^5 S1 + (h0w8i)^6 S2 + (h0w8i)^7 S3
                h0w80 := mload(add(pMem, pH0w8_3))
                c0Value := addmod(
                    calldataload(pEval_ql),
                    mulmod(calldataload(pEval_qr), h0w80, q),
                    q
                )
                h0w8i := mulmod(h0w80, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qo), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qm), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qc), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s1), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s2), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s3), h0w8i, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c0Value,
                        mulmod(num, mload(add(pMem, add(pLiS0Inv, 96))), q),
                        q
                    ),
                    q
                )

                // Compute c0Value = ql + (h0w8i) qr + (h0w8i)^2 qo + (h0w8i)^3 qm + (h0w8i)^4 qc +
                //                      + (h0w8i)^5 S1 + (h0w8i)^6 S2 + (h0w8i)^7 S3
                h0w80 := mload(add(pMem, pH0w8_4))
                c0Value := addmod(
                    calldataload(pEval_ql),
                    mulmod(calldataload(pEval_qr), h0w80, q),
                    q
                )
                h0w8i := mulmod(h0w80, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qo), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qm), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qc), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s1), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s2), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s3), h0w8i, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c0Value,
                        mulmod(num, mload(add(pMem, add(pLiS0Inv, 128))), q),
                        q
                    ),
                    q
                )

                // Compute c0Value = ql + (h0w8i) qr + (h0w8i)^2 qo + (h0w8i)^3 qm + (h0w8i)^4 qc +
                //                      + (h0w8i)^5 S1 + (h0w8i)^6 S2 + (h0w8i)^7 S3
                h0w80 := mload(add(pMem, pH0w8_5))
                c0Value := addmod(
                    calldataload(pEval_ql),
                    mulmod(calldataload(pEval_qr), h0w80, q),
                    q
                )
                h0w8i := mulmod(h0w80, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qo), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qm), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qc), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s1), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s2), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s3), h0w8i, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c0Value,
                        mulmod(num, mload(add(pMem, add(pLiS0Inv, 160))), q),
                        q
                    ),
                    q
                )

                // Compute c0Value = ql + (h0w8i) qr + (h0w8i)^2 qo + (h0w8i)^3 qm + (h0w8i)^4 qc +
                //                      + (h0w8i)^5 S1 + (h0w8i)^6 S2 + (h0w8i)^7 S3
                h0w80 := mload(add(pMem, pH0w8_6))
                c0Value := addmod(
                    calldataload(pEval_ql),
                    mulmod(calldataload(pEval_qr), h0w80, q),
                    q
                )
                h0w8i := mulmod(h0w80, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qo), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qm), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qc), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s1), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s2), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s3), h0w8i, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c0Value,
                        mulmod(num, mload(add(pMem, add(pLiS0Inv, 192))), q),
                        q
                    ),
                    q
                )

                // Compute c0Value = ql + (h0w8i) qr + (h0w8i)^2 qo + (h0w8i)^3 qm + (h0w8i)^4 qc +
                //                      + (h0w8i)^5 S1 + (h0w8i)^6 S2 + (h0w8i)^7 S3
                h0w80 := mload(add(pMem, pH0w8_7))
                c0Value := addmod(
                    calldataload(pEval_ql),
                    mulmod(calldataload(pEval_qr), h0w80, q),
                    q
                )
                h0w8i := mulmod(h0w80, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qo), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qm), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_qc), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s1), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s2), h0w8i, q),
                    q
                )
                h0w8i := mulmod(h0w8i, h0w80, q)
                c0Value := addmod(
                    c0Value,
                    mulmod(calldataload(pEval_s3), h0w8i, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c0Value,
                        mulmod(num, mload(add(pMem, add(pLiS0Inv, 224))), q),
                        q
                    ),
                    q
                )

                mstore(add(pMem, pR0), res)
            }

            // Compute r1(y) by interpolating the polynomial r1(X) using 4 points (x,y)
            // where x = {h1, h1w4, h1w4^2, h1w4^3}
            // and   y = {C1(h1), C1(h1w4), C1(h1w4^2), C1(h1w4^3)}
            // and computing T0(xi)
            function computeR1(pMem) {
                let num := 1
                let y := mload(add(pMem, pY))
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)
                num := mulmod(num, y, q)

                num := addmod(num, mod(sub(q, mload(add(pMem, pXi))), q), q)

                let t0
                let evalA := calldataload(pEval_a)
                let evalB := calldataload(pEval_b)
                let evalC := calldataload(pEval_c)

                t0 := mulmod(calldataload(pEval_ql), evalA, q)
                t0 := addmod(t0, mulmod(calldataload(pEval_qr), evalB, q), q)
                t0 := addmod(
                    t0,
                    mulmod(calldataload(pEval_qm), mulmod(evalA, evalB, q), q),
                    q
                )
                t0 := addmod(t0, mulmod(calldataload(pEval_qo), evalC, q), q)
                t0 := addmod(t0, calldataload(pEval_qc), q)
                t0 := addmod(t0, mload(add(pMem, pPi)), q)
                t0 := mulmod(t0, mload(add(pMem, pZhInv)), q)

                let res
                let c1Value
                let h1w4
                let square
                c1Value := evalA
                h1w4 := mload(add(pMem, pH1w4_0))

                c1Value := addmod(c1Value, mulmod(h1w4, evalB, q), q)
                square := mulmod(h1w4, h1w4, q)
                c1Value := addmod(c1Value, mulmod(square, evalC, q), q)
                c1Value := addmod(
                    c1Value,
                    mulmod(mulmod(square, h1w4, q), t0, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c1Value,
                        mulmod(
                            num,
                            mload(add(pMem, add(pLiS1Inv, mul(0, 32)))),
                            q
                        ),
                        q
                    ),
                    q
                )

                c1Value := evalA
                h1w4 := mload(add(pMem, pH1w4_1))

                c1Value := addmod(c1Value, mulmod(h1w4, evalB, q), q)
                square := mulmod(h1w4, h1w4, q)
                c1Value := addmod(c1Value, mulmod(square, evalC, q), q)
                c1Value := addmod(
                    c1Value,
                    mulmod(mulmod(square, h1w4, q), t0, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c1Value,
                        mulmod(
                            num,
                            mload(add(pMem, add(pLiS1Inv, mul(1, 32)))),
                            q
                        ),
                        q
                    ),
                    q
                )

                c1Value := evalA
                h1w4 := mload(add(pMem, pH1w4_2))

                c1Value := addmod(c1Value, mulmod(h1w4, evalB, q), q)
                square := mulmod(h1w4, h1w4, q)
                c1Value := addmod(c1Value, mulmod(square, evalC, q), q)
                c1Value := addmod(
                    c1Value,
                    mulmod(mulmod(square, h1w4, q), t0, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c1Value,
                        mulmod(
                            num,
                            mload(add(pMem, add(pLiS1Inv, mul(2, 32)))),
                            q
                        ),
                        q
                    ),
                    q
                )

                c1Value := evalA
                h1w4 := mload(add(pMem, pH1w4_3))

                c1Value := addmod(c1Value, mulmod(h1w4, evalB, q), q)
                square := mulmod(h1w4, h1w4, q)
                c1Value := addmod(c1Value, mulmod(square, evalC, q), q)
                c1Value := addmod(
                    c1Value,
                    mulmod(mulmod(square, h1w4, q), t0, q),
                    q
                )

                res := addmod(
                    res,
                    mulmod(
                        c1Value,
                        mulmod(
                            num,
                            mload(add(pMem, add(pLiS1Inv, mul(3, 32)))),
                            q
                        ),
                        q
                    ),
                    q
                )

                mstore(add(pMem, pR1), res)
            }

            // Compute r2(y) by interpolating the polynomial r2(X) using 6 points (x,y)
            // where x = {[h2, h2w3, h2w3^2], [h3, h3w3, h3w3^2]}
            // and   y = {[C2(h2), C2(h2w3), C2(h2w3^2)], [C2(h3), C2(h3w3), C2(h3w3^2)]}
            // and computing T1(xi) and T2(xi)
            function computeR2(pMem) {
                let y := mload(add(pMem, pY))
                let num := 1
                num := mulmod(y, num, q)
                num := mulmod(y, num, q)
                num := mulmod(y, num, q)
                num := mulmod(y, num, q)
                num := mulmod(y, num, q)
                num := mulmod(y, num, q)

                let num2 := 1
                num2 := mulmod(y, num2, q)
                num2 := mulmod(y, num2, q)
                num2 := mulmod(y, num2, q)
                num2 := mulmod(
                    num2,
                    addmod(
                        mulmod(mload(add(pMem, pXi)), w1, q),
                        mload(add(pMem, pXi)),
                        q
                    ),
                    q
                )

                num := addmod(num, mod(sub(q, num2), q), q)

                num2 := mulmod(
                    mulmod(mload(add(pMem, pXi)), w1, q),
                    mload(add(pMem, pXi)),
                    q
                )

                num := addmod(num, num2, q)

                let t1
                let t2
                let betaXi := mulmod(
                    mload(add(pMem, pBeta)),
                    mload(add(pMem, pXi)),
                    q
                )
                let gamma := mload(add(pMem, pGamma))

                t2 := addmod(calldataload(pEval_a), addmod(betaXi, gamma, q), q)
                t2 := mulmod(
                    t2,
                    addmod(
                        calldataload(pEval_b),
                        addmod(mulmod(betaXi, k1, q), gamma, q),
                        q
                    ),
                    q
                )
                t2 := mulmod(
                    t2,
                    addmod(
                        calldataload(pEval_c),
                        addmod(mulmod(betaXi, k2, q), gamma, q),
                        q
                    ),
                    q
                )
                t2 := mulmod(t2, calldataload(pEval_z), q)

                //Let's use t1 as a temporal variable to save one local
                t1 := addmod(
                    calldataload(pEval_a),
                    addmod(
                        mulmod(
                            mload(add(pMem, pBeta)),
                            calldataload(pEval_s1),
                            q
                        ),
                        gamma,
                        q
                    ),
                    q
                )
                t1 := mulmod(
                    t1,
                    addmod(
                        calldataload(pEval_b),
                        addmod(
                            mulmod(
                                mload(add(pMem, pBeta)),
                                calldataload(pEval_s2),
                                q
                            ),
                            gamma,
                            q
                        ),
                        q
                    ),
                    q
                )
                t1 := mulmod(
                    t1,
                    addmod(
                        calldataload(pEval_c),
                        addmod(
                            mulmod(
                                mload(add(pMem, pBeta)),
                                calldataload(pEval_s3),
                                q
                            ),
                            gamma,
                            q
                        ),
                        q
                    ),
                    q
                )
                t1 := mulmod(t1, calldataload(pEval_zw), q)

                t2 := addmod(t2, mod(sub(q, t1), q), q)
                t2 := mulmod(t2, mload(add(pMem, pZhInv)), q)

                // Compute T1(xi)
                t1 := sub(calldataload(pEval_z), 1)
                t1 := mulmod(t1, mload(add(pMem, pEval_l1)), q)
                t1 := mulmod(t1, mload(add(pMem, pZhInv)), q)

                // Let's use local variable gamma to save the result
                gamma := 0

                let hw
                let c2Value

                hw := mload(add(pMem, pH2w3_0))
                c2Value := addmod(calldataload(pEval_z), mulmod(hw, t1, q), q)
                c2Value := addmod(c2Value, mulmod(mulmod(hw, hw, q), t2, q), q)
                gamma := addmod(
                    gamma,
                    mulmod(
                        c2Value,
                        mulmod(
                            num,
                            mload(add(pMem, add(pLiS2Inv, mul(0, 32)))),
                            q
                        ),
                        q
                    ),
                    q
                )

                hw := mload(add(pMem, pH2w3_1))
                c2Value := addmod(calldataload(pEval_z), mulmod(hw, t1, q), q)
                c2Value := addmod(c2Value, mulmod(mulmod(hw, hw, q), t2, q), q)
                gamma := addmod(
                    gamma,
                    mulmod(
                        c2Value,
                        mulmod(
                            num,
                            mload(add(pMem, add(pLiS2Inv, mul(1, 32)))),
                            q
                        ),
                        q
                    ),
                    q
                )

                hw := mload(add(pMem, pH2w3_2))
                c2Value := addmod(calldataload(pEval_z), mulmod(hw, t1, q), q)
                c2Value := addmod(c2Value, mulmod(mulmod(hw, hw, q), t2, q), q)
                gamma := addmod(
                    gamma,
                    mulmod(
                        c2Value,
                        mulmod(
                            num,
                            mload(add(pMem, add(pLiS2Inv, mul(2, 32)))),
                            q
                        ),
                        q
                    ),
                    q
                )

                hw := mload(add(pMem, pH3w3_0))
                c2Value := addmod(
                    calldataload(pEval_zw),
                    mulmod(hw, calldataload(pEval_t1w), q),
                    q
                )
                c2Value := addmod(
                    c2Value,
                    mulmod(mulmod(hw, hw, q), calldataload(pEval_t2w), q),
                    q
                )
                gamma := addmod(
                    gamma,
                    mulmod(
                        c2Value,
                        mulmod(
                            num,
                            mload(add(pMem, add(pLiS2Inv, mul(3, 32)))),
                            q
                        ),
                        q
                    ),
                    q
                )

                hw := mload(add(pMem, pH3w3_1))
                c2Value := addmod(
                    calldataload(pEval_zw),
                    mulmod(hw, calldataload(pEval_t1w), q),
                    q
                )
                c2Value := addmod(
                    c2Value,
                    mulmod(mulmod(hw, hw, q), calldataload(pEval_t2w), q),
                    q
                )
                gamma := addmod(
                    gamma,
                    mulmod(
                        c2Value,
                        mulmod(
                            num,
                            mload(add(pMem, add(pLiS2Inv, mul(4, 32)))),
                            q
                        ),
                        q
                    ),
                    q
                )

                hw := mload(add(pMem, pH3w3_2))
                c2Value := addmod(
                    calldataload(pEval_zw),
                    mulmod(hw, calldataload(pEval_t1w), q),
                    q
                )
                c2Value := addmod(
                    c2Value,
                    mulmod(mulmod(hw, hw, q), calldataload(pEval_t2w), q),
                    q
                )
                gamma := addmod(
                    gamma,
                    mulmod(
                        c2Value,
                        mulmod(
                            num,
                            mload(add(pMem, add(pLiS2Inv, mul(5, 32)))),
                            q
                        ),
                        q
                    ),
                    q
                )

                mstore(add(pMem, pR2), gamma)
            }

            // G1 function to accumulate a G1 value to an address
            function g1_acc(pR, pP) {
                let mIn := mload(0x40)
                mstore(mIn, mload(pR))
                mstore(add(mIn, 32), mload(add(pR, 32)))
                mstore(add(mIn, 64), mload(pP))
                mstore(add(mIn, 96), mload(add(pP, 32)))

                let success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            // G1 function to multiply a G1 value to value in an address
            function g1_mulAcc(pR, pP, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, calldataload(pP))
                mstore(add(mIn, 32), calldataload(add(pP, 32)))
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function computeFEJ(pMem) {
                // Prepare shared numerator between F, E and J to reuse it
                let y := mload(add(pMem, pY))
                let numerator := addmod(
                    y,
                    mod(sub(q, mload(add(pMem, pH0w8_0))), q),
                    q
                )
                numerator := mulmod(
                    numerator,
                    addmod(y, mod(sub(q, mload(add(pMem, pH0w8_1))), q), q),
                    q
                )
                numerator := mulmod(
                    numerator,
                    addmod(y, mod(sub(q, mload(add(pMem, pH0w8_2))), q), q),
                    q
                )
                numerator := mulmod(
                    numerator,
                    addmod(y, mod(sub(q, mload(add(pMem, pH0w8_3))), q), q),
                    q
                )
                numerator := mulmod(
                    numerator,
                    addmod(y, mod(sub(q, mload(add(pMem, pH0w8_4))), q), q),
                    q
                )
                numerator := mulmod(
                    numerator,
                    addmod(y, mod(sub(q, mload(add(pMem, pH0w8_5))), q), q),
                    q
                )
                numerator := mulmod(
                    numerator,
                    addmod(y, mod(sub(q, mload(add(pMem, pH0w8_6))), q), q),
                    q
                )
                numerator := mulmod(
                    numerator,
                    addmod(y, mod(sub(q, mload(add(pMem, pH0w8_7))), q), q),
                    q
                )

                // Prepare shared quotient between F and E to reuse it
                let quotient1 := mulmod(
                    mload(add(pMem, pAlpha)),
                    mulmod(numerator, mload(add(pMem, pDenH1)), q),
                    q
                )
                let quotient2 := mulmod(
                    mulmod(
                        mload(add(pMem, pAlpha)),
                        mload(add(pMem, pAlpha)),
                        q
                    ),
                    mulmod(numerator, mload(add(pMem, pDenH2)), q),
                    q
                )

                // Compute full batched polynomial commitment [F]_1
                mstore(add(pMem, pF), C0x)
                mstore(add(pMem, add(pF, 32)), C0y)
                g1_mulAcc(add(pMem, pF), pC1, quotient1)
                g1_mulAcc(add(pMem, pF), pC2, quotient2)

                // Compute group-encoded batch evaluation [E]_1
                g1_mulAccC(
                    add(pMem, pE),
                    G1x,
                    G1y,
                    addmod(
                        mload(add(pMem, pR0)),
                        addmod(
                            mulmod(quotient1, mload(add(pMem, pR1)), q),
                            mulmod(quotient2, mload(add(pMem, pR2)), q),
                            q
                        ),
                        q
                    )
                )

                // Compute the full difference [J]_1
                g1_mulAcc(add(pMem, pJ), pW1, numerator)
            }

            // Validate all evaluations with a pairing checking that e([F]_1 - [E]_1 - [J]_1 + y[W2]_1, [1]_2) == e([W']_1, [x]_2)
            function checkPairing(pMem) -> isOk {
                let mIn := mload(0x40)

                // First pairing value
                // Compute -E
                mstore(
                    add(add(pMem, pE), 32),
                    mod(sub(qf, mload(add(add(pMem, pE), 32))), qf)
                )
                // Compute -J
                mstore(
                    add(add(pMem, pJ), 32),
                    mod(sub(qf, mload(add(add(pMem, pJ), 32))), qf)
                )
                // F = F - E - J + y·W2
                g1_acc(add(pMem, pF), add(pMem, pE))
                g1_acc(add(pMem, pF), add(pMem, pJ))
                g1_mulAcc(add(pMem, pF), pW2, mload(add(pMem, pY)))

                mstore(mIn, mload(add(pMem, pF)))
                mstore(add(mIn, 32), mload(add(add(pMem, pF), 32)))

                // Second pairing value
                mstore(add(mIn, 64), G2x2)
                mstore(add(mIn, 96), G2x1)
                mstore(add(mIn, 128), G2y2)
                mstore(add(mIn, 160), G2y1)

                // Third pairing value
                // Compute -W2
                mstore(add(mIn, 192), calldataload(pW2))
                let s := calldataload(add(pW2, 32))
                s := mod(sub(qf, s), qf)
                mstore(add(mIn, 224), s)

                // Fourth pairing value
                mstore(add(mIn, 256), X2x2)
                mstore(add(mIn, 288), X2x1)
                mstore(add(mIn, 320), X2y2)
                mstore(add(mIn, 352), X2y1)

                let success := staticcall(
                    sub(gas(), 2000),
                    8,
                    mIn,
                    384,
                    mIn,
                    0x20
                )

                isOk := and(success, mload(mIn))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, lastMem))

            // Validate that all evaluations ∈ F
            checkInput()

            // Compute the challenges: beta, gamma, xi, alpha and y ∈ F, h1w4/h2w3/h3w3 roots, xiN and zh(xi)
            computeChallenges(pMem, pubSignals)

            // To divide prime fields the Extended Euclidean Algorithm for computing modular inverses is needed.
            // The Montgomery batch inversion algorithm allow us to compute n inverses reducing to a single one inversion.
            // More info: https://vitalik.ca/general/2018/07/21/starks_part_3.html
            // To avoid this single inverse computation on-chain, it has been computed in proving time and send it to the verifier.
            // Therefore, the verifier:
            //      1) Prepare all the denominators to inverse
            //      2) Check the inverse sent by the prover it is what it should be
            //      3) Compute the others inverses using the Montgomery Batched Algorithm using the inverse sent to avoid the inversion operation it does.
            computeInversions(pMem)

            // Compute Lagrange polynomial evaluations Li(xi)
            computeLagrange(pMem)

            // Compute public input polynomial evaluation PI(xi) = \sum_i^l -public_input_i·L_i(xi)
            computePi(pMem, pubSignals)

            // Computes r1(y) and r2(y)
            computeR0(pMem)
            computeR1(pMem)
            computeR2(pMem)

            // Compute full batched polynomial commitment [F]_1, group-encoded batch evaluation [E]_1 and the full difference [J]_1
            computeFEJ(pMem)

            // Validate all evaluations
            let isValid := checkPairing(pMem)

            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}
